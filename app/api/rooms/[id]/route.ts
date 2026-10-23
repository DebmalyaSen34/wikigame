import type { NextRequest } from "next/server";
import { rankPlayers, toPublic, type RoomView } from "@/lib/game";
import { store } from "@/lib/store";

// GET /api/rooms/:id -> room + leaderboard.
// Send the x-player-token header to identify yourself; other players' routes
// are only revealed once you've finished or given up.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/rooms/[id]">) {
  const { id } = await ctx.params;
  const room = await store.getRoom(id.toUpperCase());
  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });

  const token = req.headers.get("x-player-token");
  const players = await store.listPlayers(room.id);
  const viewer = token ? players.find((p) => p.token === token) : undefined;
  const viewerDone = viewer ? viewer.status !== "playing" : false;

  const view: RoomView = {
    room,
    players: rankPlayers(players).map((p) => toPublic(p, viewerDone || p.token === token)),
    meId: viewer?.id,
    viewerDone,
  };
  return Response.json(view);
}
