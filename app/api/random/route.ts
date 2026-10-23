import type { NextRequest } from "next/server";
import { randomPopular } from "@/lib/wiki";
import { randomHardPage } from "@/lib/hardPool";

// GET /api/random?mode=popular|hard&role=start|end&exclude=Title
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") ?? "popular";
  const exclude = req.nextUrl.searchParams.getAll("exclude");
  try {
    const role = req.nextUrl.searchParams.get("role") === "start" ? "start" : "end";
    const title = mode === "hard" ? randomHardPage(role, exclude) : randomPopular(exclude);
    return Response.json({ title });
  } catch {
    return Response.json({ error: "Couldn't reach Wikipedia" }, { status: 502 });
  }
}
