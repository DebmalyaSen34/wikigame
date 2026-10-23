import type { NextRequest } from "next/server";
import { randomArticle, randomPopular } from "@/lib/wiki";

// GET /api/random?mode=popular|any&exclude=Title
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") ?? "popular";
  const exclude = req.nextUrl.searchParams.getAll("exclude");
  try {
    const title = mode === "any" ? await randomArticle() : randomPopular(exclude);
    return Response.json({ title });
  } catch {
    return Response.json({ error: "Couldn't reach Wikipedia" }, { status: 502 });
  }
}
