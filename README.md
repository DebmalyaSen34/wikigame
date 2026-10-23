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

Live at **https://wikigame-indol.vercel.app**.

Vercel's functions can't keep files, so rooms need a Redis database. Without one, creating a room
fails with "Room storage isn't set up on this deployment".

1. In the Vercel dashboard, open the project → **Storage** → **Create Database** → **Upstash for Redis**
   (free plan is plenty), and connect it to the project for all environments.
   This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which the app picks up automatically
   (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` work too).
2. Redeploy (Deployments → ⋯ → Redeploy) so the new variables take effect.
3. Optional: set `NEXT_PUBLIC_SITE_URL` if the site moves to a custom domain. Share links and link
   previews use it; it defaults to `https://wikigame-indol.vercel.app`.
4. Optional: set `WIKI_USER_AGENT` (it must include a contact URL or email: Wikimedia limits clients
   without one to 10 requests/minute, versus 200 with one).

Share links always point at the public site, even when opened from a preview deployment, because
friends usually can't open preview URLs. Locally they use your own address (e.g. `localhost:3000`),
since that's where local rooms live.

## Code map

- `lib/wiki.ts` – Wikipedia API: fetches article HTML, keeps only article links, caches pages.
- `lib/store.ts` – storage (Redis if configured, otherwise local files).
- `lib/game.ts` – shared types and ranking.
- `app/api/rooms/...` – create room, join, play (click / back / give up), leaderboard.
- `app/page.tsx`, `app/r/[id]/Lobby.tsx`, `app/r/[id]/play/Play.tsx` – the UI.
