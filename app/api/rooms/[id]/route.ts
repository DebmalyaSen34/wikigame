import { after, type NextRequest } from "next/server";
import { expire, isOutOfTime, rankPlayers, toPublic, type RoomView } from "@/lib/game";
import { startNextRound } from "@/lib/rooms";
import { store } from "@/lib/store";
import { withErrors } from "@/lib/api";

// GET /api/rooms/:id -> room + leaderboard.
// Send the x-player-token header to identify yourself; other players' routes
// are only revealed once you've finished or given up.
export const GET = withErrors(async function GET(req: NextRequest, ctx: RouteContext<"/api/rooms/[id]">) {
  const { id } = await ctx.params;
  const room = await store.getRoom(id.toUpperCase());
  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });

  const token = req.headers.get("x-player-token");
  let players = await store.listPlayers(room.id);

  // With a time limit, players whose time ran out are marked here too, so
  // someone who closed their tab can't hold up the round. If that leaves
  // nobody playing, move on to the next round (or end the game).
  if (room.timeLimitSec) {
    const expired = players.filter((p) => isOutOfTime(room, p)).map((p) => expire(room, p));
    if (expired.length) {
      await Promise.all(expired.map((p) => store.savePlayer(room.id, p)));
      players = players.map((p) => expired.find((e) => e.token === p.token) ?? p);
      if (!room.nextRoomId && !room.endedAt && players.every((p) => p.status !== "playing")) {
        after(() => startNextRound(room.id));
      }
    }
  }
  const viewer = token ? players.find((p) => p.token === token) : undefined;
  const viewerDone = viewer ? viewer.status !== "playing" : false;

  const view: RoomView = {
    room,
    players: rankPlayers(players).map((p) => toPublic(p, viewerDone || p.token === token)),
    meId: viewer?.id,
    viewerDone,
  };
  return Response.json(view);
});
