import { withErrors } from "@/lib/api";
import { store } from "@/lib/store";
import { startRematch } from "@/lib/rooms";

// POST /api/rooms/:id/rematch { token } -> { nextRoomId }
// After a game ends, starts a new game with the same difficulty and length.
export const POST = withErrors(async function POST(req: Request, ctx: RouteContext<"/api/rooms/[id]/rematch">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const room = await store.getRoom(id.toUpperCase());
  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
  if (!room.endedAt) return Response.json({ error: "This game isn't over yet" }, { status: 409 });
  const player = body.token ? await store.getPlayer(room.id, String(body.token)) : null;
  if (!player) return Response.json({ error: "You haven't joined this room" }, { status: 403 });
  if (room.nextRoomId) return Response.json({ nextRoomId: room.nextRoomId });

  try {
    const nextRoomId = await startRematch(room.id, player.name);
    return Response.json({ nextRoomId }, { status: nextRoomId ? 200 : 202 });
  } catch (e) {
    return Response.json({ error: (e as Error).message || "Couldn't start a new game" }, { status: 502 });
  }
});
