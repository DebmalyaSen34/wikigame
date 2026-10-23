// Server-only helpers for talking to the Wikipedia API and turning article
// HTML into something the game can render and validate clicks against.

import { cacheLife } from "next/cache";
import type { PageInfo } from "./game";
import { store } from "./store";

// Which Wikipedia to play on. Set WIKI_ORIGIN for another language edition
// (e.g. https://fr.wikipedia.org); it's also how tests point at a fake server.
const ORIGIN = (process.env.WIKI_ORIGIN ?? "https://en.wikipedia.org").replace(/\/$/, "");
export const API = `${ORIGIN}/w/api.php`;
const REST = `${ORIGIN}/api/rest_v1`;

// Wikimedia rate-limits clients without contact info in their User-Agent to
// 10 requests/minute; a compliant one (with a URL or email) gets 200/minute.
const USER_AGENT =
  process.env.WIKI_USER_AGENT ?? "WikiRace/0.1 (https://github.com/DebmalyaSen34/wikigame)";

export type Article = {
  title: string; // canonical title, after redirects
  displayTitle: string; // may contain HTML (italics etc.)
  html: string; // sanitized, links rewritten to data-wiki attributes
  links: string[]; // normalized titles of every clickable article link
};

// Titles in other namespaces aren't articles and can't be part of a path.
const NON_ARTICLE =
  /^(talk|user|user talk|wikipedia|wp|project|file|image|mediawiki|template|help|category|portal|draft|timedtext|module|special|media|book|gadget|education program)( talk)?:/i;

export function normalizeTitle(raw: string): string {
  let t = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (t) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

// ---------- Talking to Wikipedia ----------
//
// Wikimedia's rules: at most 3 concurrent requests and 200/minute per
// User-Agent, and honour Retry-After on a 429. So every request:
// - waits for one of MAX_CONCURRENT slots on this server;
// - fits into a per-minute budget shared by all servers (counted in Redis;
//   if storage is unavailable, a per-server budget still applies);
// - pauses while this server is backing off after a 429;
// - times out after TIMEOUT_MS, and is retried with backoff on timeouts,
//   network errors, 429 and 5xx.
const MAX_CONCURRENT = 2;
const MAX_PER_MINUTE = 180;
const TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 4;
let active = 0;
const waiting: (() => void)[] = [];
const recent: number[] = [];
let pausedUntil = 0; // set by a 429; holds every request on this server

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withinSharedBudget() {
  try {
    for (;;) {
      const minute = Math.floor(Date.now() / 60_000);
      if ((await store.count(`wiki-budget:${minute}`, 70)) <= MAX_PER_MINUTE) return;
      await sleep((minute + 1) * 60_000 - Date.now() + 50); // wait for the next minute
    }
  } catch {
    // Storage unavailable: the per-server budget below still applies.
  }
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active < MAX_CONCURRENT) active++;
  else await new Promise<void>((r) => waiting.push(r)); // slot is handed over by the finishing request
  try {
    while (Date.now() < pausedUntil) await sleep(pausedUntil - Date.now());
    for (;;) {
      while (recent.length && Date.now() - recent[0] > 60_000) recent.shift();
      if (recent.length < MAX_PER_MINUTE) break;
      await sleep(60_000 - (Date.now() - recent[0]) + 10);
    }
    await withinSharedBudget();
    recent.push(Date.now());
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

class RetryableError extends Error {
  constructor(
    message: string,
    readonly waitMs?: number,
  ) {
    super(message);
  }
}

function backoff(attempt: number) {
  return 500 * 2 ** attempt + Math.random() * 300; // 0.5s, 1s, 2s… plus jitter
}

export async function wikiFetch(url: string) {
  let lastError: Error = new Error("Wikipedia isn't responding right now, try again in a moment");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await withSlot(async () => {
        const res = await fetch(url, {
          headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 429 || res.status >= 500) {
          // Wikimedia asks for at least 5s when no Retry-After is given on a 429.
          const retryAfter = Number(res.headers.get("retry-after"));
          const waitMs = retryAfter > 0 ? Math.min(20_000, retryAfter * 1000) : res.status === 429 ? 5000 : undefined;
          if (res.status === 429 && waitMs) pausedUntil = Math.max(pausedUntil, Date.now() + waitMs);
          throw new RetryableError(
            res.status === 429
              ? "Wikipedia is rate-limiting us, try again in a minute"
              : `Wikipedia is having trouble (${res.status}), try again in a moment`,
            waitMs,
          );
        }
        if (!res.ok) throw new Error(`Wikipedia responded ${res.status}`);
        return await res.json();
      });
    } catch (e) {
      const retryable =
        e instanceof RetryableError ||
        (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || e.name === "TypeError"));
      if (!retryable) throw e;
      lastError =
        e instanceof RetryableError ? e : new Error("Wikipedia isn't responding right now, try again in a moment");
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(e instanceof RetryableError && e.waitMs ? e.waitMs : backoff(attempt));
      }
    }
  }
  throw lastError;
}

// Small in-memory cache: every player in a room loads the same few pages, and
// each click needs the previous page's links for validation.
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 500;
const articleCache = new Map<string, { at: number; value: Promise<Article> }>();

export function getArticle(title: string): Promise<Article> {
  const key = normalizeTitle(title);
  const hit = articleCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;

  const value = loadArticle(key);
  articleCache.set(key, { at: Date.now(), value });
  value.then(
    (a) => {
      // Also cache under the canonical title so redirect targets are reused.
      if (a.title !== key) articleCache.set(a.title, { at: Date.now(), value });
    },
    () => articleCache.delete(key),
  );
  if (articleCache.size > CACHE_MAX) {
    const oldest = articleCache.keys().next().value;
    if (oldest) articleCache.delete(oldest);
  }
  return value;
}

// Shared by every server instance (on Vercel, the runtime cache), so a page
// is fetched from Wikipedia and processed once rather than once per instance.
// This matters because Wikipedia rate-limits us and big pages take seconds.
async function loadArticle(title: string): Promise<Article> {
  "use cache: remote";
  cacheLife("days");
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    redirects: "1",
    prop: "text|displaytitle",
    disableeditsection: "1",
    disablelimitreport: "1",
    format: "json",
    formatversion: "2",
  });
  const data = await wikiFetch(`${API}?${params}`);
  if (data.error) throw new Error(data.error.info ?? "Page not found");
  const { html, links } = rewriteHtml(data.parse.text as string);
  return {
    title: normalizeTitle(data.parse.title),
    displayTitle: data.parse.displaytitle ?? data.parse.title,
    html,
    links,
  };
}

function titleFromHref(href: string): string | null {
  if (!href.startsWith("/wiki/")) return null;
  let path = href.slice("/wiki/".length).split("#")[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  const title = normalizeTitle(path);
  if (!title || NON_ARTICLE.test(title) || title === "Main Page") return null;
  return title;
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Keeps only links to other articles (as data-wiki="Title"); every other link
// (files, categories, citations, external sites, red links) becomes plain text.
function rewriteHtml(raw: string): { html: string; links: string[] } {
  const links = new Set<string>();

  let html = raw
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_m, attrs: string, inner: string) => {
      const href = /\shref="([^"]*)"/i.exec(attrs)?.[1];
      const title = href ? titleFromHref(href.replace(/&amp;/g, "&")) : null;
      if (!title) return `<span class="wg-dead">${inner}</span>`;
      links.add(title);
      return `<a href="#" data-wiki="${escapeAttr(title)}">${inner}</a>`;
    })
    // Slimming: about a third of Wikipedia's HTML is markup the game never uses.
    .replace(/<!--[\s\S]*?-->/g, "")
    // Citation markers like [12] and [citation needed] link nowhere playable.
    .replace(/<sup\b[^>]*class="[^"]*\b(reference|Inline-Template)\b[^"]*"[^>]*>[\s\S]*?<\/sup>/g, "")
    // Parser bookkeeping, plus 2x image variants (srcset) that mostly cost mobile data.
    .replace(/\s(?:data-(?!wiki=)[\w-]+|about|typeof|resource|id|decoding|rel|lang|srcset|role|aria-[\w-]+)="[^"]*"/g, "");

  // Protocol-relative image URLs would otherwise resolve against our origin's scheme; make them explicit.
  html = html.replace(/\ssrc="\/\//g, ' src="https://');

  return { html, links: [...links] };
}

// Resolves redirects and checks that an article exists. Shared cache: the
// answer barely changes, and failures throw so they aren't cached.
export async function resolveTitle(title: string): Promise<string | null> {
  "use cache: remote";
  cacheLife("days");
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    redirects: "1",
    format: "json",
    formatversion: "2",
  });
  const data = await wikiFetch(`${API}?${params}`);
  const page = data.query?.pages?.[0];
  if (!page || page.missing || page.invalid || page.ns !== 0) return null;
  return normalizeTitle(page.title);
}

async function fetchPageInfo(title: string): Promise<PageInfo> {
  "use cache: remote";
  cacheLife("days");
  const data = await wikiFetch(`${REST}/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  return { title, description: data.description, extract: data.extract, thumbnail: data.thumbnail?.source };
}

// The picture and blurb for a page card. Optional: if Wikipedia can't be
// reached, the card shows just the title (and that isn't cached).
export async function getPageInfo(title: string): Promise<PageInfo> {
  try {
    return await fetchPageInfo(title);
  } catch {
    return { title };
  }
}

// Fully random articles are often obscure stubs, so by default games pick
// from well-known topics that are reachable in a handful of clicks.
export const POPULAR_TITLES = [
  "Albert Einstein", "Pizza", "Mount Everest", "The Beatles", "Ancient Egypt", "Moon",
  "Football", "Leonardo da Vinci", "Coffee", "Volcano", "World War II", "Shark",
  "Taj Mahal", "Chess", "Internet", "Dinosaur", "Mahatma Gandhi", "Jazz", "Chocolate",
  "Olympic Games", "Black hole", "Roman Empire", "Bollywood", "Penguin", "Bitcoin",
  "Harry Potter", "Amazon rainforest", "William Shakespeare", "Tea", "Vikings",
  "Great Wall of China", "Elephant", "Cricket", "Star Wars", "Photosynthesis",
  "Napoleon", "Mars", "Sushi", "Pyramid", "Video game", "Eiffel Tower", "Tiger",
  "Isaac Newton", "Hip hop music", "Antarctica", "Titanic", "Banana", "Wolfgang Amadeus Mozart",
  "Artificial intelligence", "Samurai", "Earthquake", "Coca-Cola", "Lion", "Nile",
  "Marie Curie", "Basketball", "Pokémon", "Statue of Liberty", "Honey", "DNA",
  "Cleopatra", "Lego", "Sahara", "Octopus", "Charlie Chaplin", "Rice", "Tsunami",
  "Japan", "Brazil", "Bicycle", "Dragon", "Pirate", "Electricity", "Michael Jackson",
  "Tennis", "Kangaroo", "Venice", "Printing press", "Hamburger", "Rainbow", "Aurora",
];

export function randomPopular(exclude: string[] = []): string {
  const pool = POPULAR_TITLES.filter((t) => !exclude.includes(t));
  return pool[Math.floor(Math.random() * pool.length)];
}
