// Server-only helpers for talking to the Wikipedia API and turning article
// HTML into something the game can render and validate clicks against.

import type { PageInfo } from "./game";

const API = "https://en.wikipedia.org/w/api.php";
const REST = "https://en.wikipedia.org/api/rest_v1";

// Wikimedia asks API clients to send a descriptive User-Agent with contact info.
const USER_AGENT =
  process.env.WIKI_USER_AGENT ?? "WikigameWithFriends/0.1 (personal hobby project)";

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

async function wikiFetch(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia responded ${res.status}`);
  return res.json();
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

async function loadArticle(title: string): Promise<Article> {
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
      return `<a href="#" data-wiki="${escapeAttr(title)}" title="${escapeAttr(title)}">${inner}</a>`;
    });

  // Protocol-relative image URLs would otherwise resolve against our origin's scheme; make them explicit.
  html = html.replace(/(src|srcset)="\/\//g, '$1="https://').replace(/, \/\/upload/g, ", https://upload");

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
