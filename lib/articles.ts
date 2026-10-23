"use client";

export type Article = { title: string; displayTitle: string; html: string };

// Articles already fetched (or being fetched) in this tab, so going Back,
// revisiting a page, or clicking a link that was prefetched is instant.
const MAX = 40;
const cache = new Map<string, Promise<Article>>();

const ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retries network errors and server-side failures (Wikipedia hiccups), but not
// answers like "no such page" that won't change.
async function fetchArticle(title: string): Promise<Article> {
  let lastError = new Error("Couldn't load that page, try again");
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt) await sleep(700 * 2 ** (attempt - 1) + Math.random() * 300);
    let res: Response;
    try {
      res = await fetch(`/api/article?title=${encodeURIComponent(title)}`);
    } catch {
      lastError = new Error("Couldn't reach the server. Check your connection and try again");
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data as Article;
    lastError = new Error(data.error ?? `Couldn't load that page (${res.status})`);
    if (res.status < 500 && res.status !== 429) break;
  }
  throw lastError;
}

export function loadArticle(title: string): Promise<Article> {
  const hit = cache.get(title);
  if (hit) return hit;
  const p = fetchArticle(title);
  cache.set(title, p);
  p.then(
    (a) => {
      // Reachable under its real name too, when `title` was a redirect.
      if (a.title !== title) cache.set(a.title, p);
    },
    () => cache.delete(title),
  );
  while (cache.size > MAX) cache.delete(cache.keys().next().value!);
  return p;
}

// Start downloading a page the player is probably about to open (hovered or touched link).
export function prefetchArticle(title: string) {
  loadArticle(title).catch(() => {});
}
