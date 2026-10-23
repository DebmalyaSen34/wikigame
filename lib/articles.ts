"use client";

import { api } from "./client";

export type Article = { title: string; displayTitle: string; html: string };

// Articles already fetched (or being fetched) in this tab, so going Back,
// revisiting a page, or clicking a link that was prefetched is instant.
const MAX = 40;
const cache = new Map<string, Promise<Article>>();

export function loadArticle(title: string): Promise<Article> {
  const hit = cache.get(title);
  if (hit) return hit;
  const p = api<Article>(`/api/article?title=${encodeURIComponent(title)}`);
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
