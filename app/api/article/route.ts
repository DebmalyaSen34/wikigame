import type { NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { withErrors } from "@/lib/api";
import { getArticle } from "@/lib/wiki";

// GET /api/article?title=Chess -> { title, displayTitle, html }
//
// Article HTML is the same for everyone, so it is served separately from game
// moves and cached by Vercel's CDN close to the player. The game page fetches
// it in parallel with each move (and prefetches on hover/touch), so a click
// mostly waits for the small move response, not a megabyte of HTML.
export const GET = withErrors(async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title")?.trim();
  if (!title) return Response.json({ error: "Missing title" }, { status: 400 });
  try {
    const a = await getArticle(title);
    return Response.json(
      { title: a.title, displayTitle: a.displayTitle, html: a.html },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (e) {
    unstable_rethrow(e);
    return Response.json({ error: "Couldn't load that page from Wikipedia, try again" }, { status: 502 });
  }
});
