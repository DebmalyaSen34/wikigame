// Server-only helpers for talking to the Wikipedia API and turning article
// HTML into something the game can render and validate clicks against.

import { cacheLife } from "next/cache";
import type { PageInfo } from "./game";

export const API = "https://en.wikipedia.org/w/api.php";
const REST = "https://en.wikipedia.org/api/rest_v1";

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

// Wikimedia's rules: at most 3 concurrent requests and 200/minute, and honour
// Retry-After on a 429. Picking a difficulty-matched pair takes dozens of
// lookups, so every request goes through this gate (per server process).
const MAX_CONCURRENT = 2;
const MAX_PER_MINUTE = 180;
let active = 0;
const waiting: (() => void)[] = [];
const recent: number[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active < MAX_CONCURRENT) active++;
  else await new Promise<void>((r) => waiting.push(r)); // slot is handed over by the finishing request
  try {
    for (;;) {
      while (recent.length && Date.now() - recent[0] > 60_000) recent.shift();
      if (recent.length < MAX_PER_MINUTE) break;
      await sleep(60_000 - (Date.now() - recent[0]) + 10);
    }
    recent.push(Date.now());
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export async function wikiFetch(url: string) {
  for (let attempt = 0; ; attempt++) {
    const res = await withSlot(() =>
      fetch(url, { headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT } }),
    );
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      // Wikimedia asks for at least 5s when no Retry-After is given.
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Math.min(15_000, retryAfter > 0 ? retryAfter * 1000 : 5000));
      continue;
    }
    if (res.status === 429) throw new Error("Wikipedia is rate-limiting us, try again in a minute");
    if (!res.ok) throw new Error(`Wikipedia responded ${res.status}`);
    return res.json();
  }
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

// Resolves redirects and checks that an article exists.
export async function resolveTitle(title: string): Promise<string | null> {
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

export async function getPageInfo(title: string): Promise<PageInfo> {
  try {
    const data = await wikiFetch(`${REST}/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
    return {
      title,
      description: data.description,
      extract: data.extract,
      thumbnail: data.thumbnail?.source,
    };
  } catch {
    return { title };
  }
}

export async function randomArticle(): Promise<string> {
  const params = new URLSearchParams({
    action: "query",
    list: "random",
    rnnamespace: "0",
    rnlimit: "1",
    format: "json",
    formatversion: "2",
  });
  const data = await wikiFetch(`${API}?${params}`);
  return normalizeTitle(data.query.random[0].title);
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
