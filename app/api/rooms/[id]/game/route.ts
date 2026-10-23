import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/api";
import { gameView } from "@/lib/rooms";

// GET /api/rooms/:id/game -> points per round and overall standings for this
// room's game (204 for older rooms, which have no game). Send x-player-token
// to get your own key back as meKey.
export const GET = withErrors(async function GET(req: NextRequest, ctx: RouteContext<"/api/rooms/[id]/game">) {
  const { id } = await ctx.params;
  const view = await gameView(id.toUpperCase(), req.headers.get("x-player-token"));
  return view ? Response.json(view) : new Response(null, { status: 204 });
});
