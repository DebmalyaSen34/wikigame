import { withErrors } from "@/lib/api";
import { store } from "@/lib/store";
import { startNextRound } from "@/lib/rooms";

// POST /api/rooms/:id/next { token } -> { nextRoomId }
//
// Rounds normally roll over by themselves once everyone is done. This lets a
// player who has finished start the next round anyway, so one friend who
// wandered off can't hold up everyone else.
export const POST = withErrors(async function POST(req: Request, ctx: RouteContext<"/api/rooms/[id]/next">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const room = await store.getRoom(id.toUpperCase());
  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
  const player = body.token ? await store.getPlayer(room.id, String(body.token)) : null;
  if (!player) return Response.json({ error: "You haven't joined this room" }, { status: 403 });
  if (player.status === "playing") {
    return Response.json({ error: "Finish or give up this round first" }, { status: 409 });
  }
  if (room.nextRoomId) return Response.json({ nextRoomId: room.nextRoomId });

  try {
    const nextRoomId = await startNextRound(room.id);
    // null: another request is creating it right now; the room will show it shortly.
    return Response.json({ nextRoomId }, { status: nextRoomId ? 200 : 202 });
  } catch (e) {
    return Response.json({ error: (e as Error).message || "Couldn't set up the next round" }, { status: 502 });
  }
});
