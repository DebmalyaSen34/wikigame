// Server-only: measures how far apart two articles are in the link graph, and
// picks start/target pairs that match a difficulty.
//
// A route of length 1 exists if the start links to the target. A route of
// length 2 exists if some page the start links to also links to the target.
// With the complete set of the start's outgoing links (redirects resolved) and
// the complete set of pages linking to the target (including via redirects),
// "no 2-click route" is a proof, not a guess.

import type { Difficulty, Par } from "./game";
import { API, POPULAR_TITLES, normalizeTitle, wikiFetch } from "./wiki";

type LinkSet = { titles: Set<string>; complete: boolean };

const TTL = 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<LinkSet> }>();

function cached(key: string, load: () => Promise<LinkSet>): Promise<LinkSet> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return value;
}

type QueryResponse = {
  continue?: Record<string, string>;
  query?: {
    pages?: { title: string; ns: number; missing?: boolean }[];
    backlinks?: { title: string; redirect?: boolean; redirlinks?: { title: string; ns: number }[] }[];
  };
};

// Follows MediaWiki's `continue` paging until done or maxPages requests.
async function paged(params: Record<string, string>, maxPages: number, onPage: (data: QueryResponse) => void) {
  let cont: Record<string, string> = {};
  for (let i = 0; i < maxPages; i++) {
    const qs = new URLSearchParams({ format: "json", formatversion: "2", ...params, ...cont });
    const data: QueryResponse = await wikiFetch(`${API}?${qs}`);
    onPage(data);
    if (!data.continue) return true;
    cont = data.continue;
  }
  return false;
}

// Articles the start page links to, as canonical titles (redirects followed).
export function outgoingLinks(title: string, maxPages = 10): Promise<LinkSet> {
  return cached(`out:${title}:${maxPages}`, async () => {
    const titles = new Set<string>();
    const complete = await paged(
      { action: "query", generator: "links", titles: title, gplnamespace: "0", gpllimit: "max", redirects: "1" },
      maxPages,
      (data) => {
        for (const p of data.query?.pages ?? []) if (!p.missing && p.ns === 0) titles.add(normalizeTitle(p.title));
      },
    );
    return { titles, complete };
  });
}

// Articles that link to the target, directly or through one of its redirects.
export function incomingLinks(title: string, maxPages = 4): Promise<LinkSet> {
  return cached(`in:${title}:${maxPages}`, async () => {
    const titles = new Set<string>();
    const complete = await paged(
      { action: "query", list: "backlinks", bltitle: title, blnamespace: "0", bllimit: "max", blredirect: "1" },
      maxPages,
      (data) => {
        for (const b of data.query?.backlinks ?? []) {
          if (!b.redirect) titles.add(normalizeTitle(b.title));
          for (const r of b.redirlinks ?? []) if (r.ns === 0) titles.add(normalizeTitle(r.title));
        }
      },
    );
    return { titles, complete };
  });
}

// Shortest route length when it can be shown to be 1 or 2, or a proven lower bound of 3.
export async function measure(start: string, end: string, maxIncomingPages = 4): Promise<Par | null> {
  const out = await outgoingLinks(start);
  if (out.titles.has(end)) return { clicks: 1 };
  const incoming = await incomingLinks(end, maxIncomingPages);
  for (const t of incoming.titles) if (out.titles.has(t)) return { clicks: 2, via: t };
  if (out.complete && incoming.complete) return { atLeast: 3 };
  return null;
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function randomTitles(n: number): Promise<string[]> {
  const qs = new URLSearchParams({
    action: "query",
    list: "random",
    rnnamespace: "0",
    rnfilterredir: "nonredirects",
    rnlimit: String(n),
    format: "json",
    formatversion: "2",
  });
  const data = await wikiFetch(`${API}?${qs}`);
  return data.query.random.map((r: { title: string }) => normalizeTitle(r.title));
}

export type Pair = { start: string; end: string; par: Par | null };

const DEADLINE_MS = 20_000;

// Easy: well-known pages exactly 2 clicks apart (not directly linked).
async function easyPair(deadline: number): Promise<Pair | null> {
  for (const start of shuffle(POPULAR_TITLES).slice(0, 4)) {
    const out = await outgoingLinks(start);
    for (const end of shuffle(POPULAR_TITLES).slice(0, 10)) {
      if (Date.now() > deadline) return null;
      if (end === start || out.titles.has(end)) continue;
      const par = await measure(start, end, 1);
      if (par && "clicks" in par && par.clicks === 2) return { start, end, par };
    }
  }
  return null;
}

// Normal: well-known pages that aren't directly linked.
async function normalPair(deadline: number): Promise<Pair | null> {
  for (const start of shuffle(POPULAR_TITLES).slice(0, 5)) {
    const out = await outgoingLinks(start);
    for (const end of shuffle(POPULAR_TITLES).slice(0, 5)) {
      if (Date.now() > deadline) return null;
      if (end === start || out.titles.has(end)) continue;
      return { start, end, par: await measure(start, end, 1) };
    }
  }
  return null;
}

// Hard: random (often obscure) pages with no route shorter than 3 clicks.
// The start needs enough links to get going, and the target must be linked
// from enough pages to be findable, but few enough that we can check all of them.
async function hardPair(deadline: number): Promise<Pair | null> {
  let start: string | null = null;
  let out: LinkSet | null = null;
  while (!start && Date.now() < deadline) {
    for (const t of await randomTitles(5)) {
      const o = await outgoingLinks(t, 4);
      if (o.complete && o.titles.size >= 40) {
        start = t;
        out = o;
        break;
      }
    }
  }
  if (!start || !out) return null;

  while (Date.now() < deadline) {
    for (const end of await randomTitles(10)) {
      if (Date.now() > deadline) return null;
      if (end === start || out.titles.has(end)) continue;
      const incoming = await incomingLinks(end, 4);
      if (!incoming.complete || incoming.titles.size < 12) continue;
      const par = await measure(start, end, 4);
      if (par && "atLeast" in par) return { start, end, par };
    }
  }
  return null;
}

export function generatePair(difficulty: Difficulty): Promise<Pair | null> {
  const deadline = Date.now() + DEADLINE_MS;
  if (difficulty === "easy") return easyPair(deadline);
  if (difficulty === "hard") return hardPair(deadline);
  return normalPair(deadline);
}
