# WikiRace

Race your friends from one Wikipedia article to another using only the links inside the articles.
Fewest clicks wins; time breaks ties.

## How it plays

1. Someone creates a game (pick the From/To pages, or roll random well-known ones) and shares the room link.
2. Each friend opens the link, enters a name and presses **Start** — their clock starts then, so people can play whenever suits them.
3. Every article link click is +1. **Back** also costs a click (classic rules). You can **Give up**.
4. The leaderboard updates every few seconds. Other players' routes stay hidden until you finish or give up, so nobody gets spoiled.

The server owns the game state: a click only counts if the page is actually linked from your current page,
and redirects are resolved (e.g. reaching "USA" counts as "United States").

## Run locally

```bash
bun install
bun run dev
```

Open http://localhost:3000. In dev, rooms are saved as JSON files under `.data/`.

## Deploy (Vercel)

Serverless functions don't share a disk, so add a Redis database:

1. Create a free [Upstash Redis](https://upstash.com) database (or add one from the Vercel Marketplace).
2. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (Vercel's `KV_REST_API_URL` / `KV_REST_API_TOKEN` also work).
3. Optionally set `WIKI_USER_AGENT` (it must include a contact URL or email: Wikimedia limits clients without one to 10 requests/minute, versus 200 with one).

## Code map

- `lib/wiki.ts` – Wikipedia API: fetches article HTML, keeps only article links, caches pages.
- `lib/store.ts` – storage (Redis if configured, otherwise local files).
- `lib/game.ts` – shared types and ranking.
- `app/api/rooms/...` – create room, join, play (click / back / give up), leaderboard.
- `app/page.tsx`, `app/r/[id]/Lobby.tsx`, `app/r/[id]/play/Play.tsx` – the UI.
