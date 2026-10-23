import type { Player } from "@/lib/game";
import { store } from "@/lib/store";
import { withErrors } from "@/lib/api";
import { seriesIdentity } from "@/lib/rooms";

// POST /api/rooms/:id/join { name, fromRoomId?, fromToken? } -> { token }. The clock starts now.
// fromRoomId/fromToken (the player's token in the previous round) keep their
// points together across a game's rounds.
export const POST = withErrors(async function POST(req: Request, ctx: RouteContext<"/api/rooms/[id]/join">) {
  const { id } = await ctx.params;
  const room = await store.getRoom(id.toUpperCase());
  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 24);
  if (!name) return Response.json({ error: "Pick a name first" }, { status: 400 });

  const player: Player = {
    id: crypto.randomUUID().slice(0, 8),
    token: crypto.randomUUID(),
    name,
    path: [room.start],
    stack: [room.start],
    backAt: [],
    clicks: 0,
    status: "playing",
    startedAt: Date.now(),
    seriesPlayerId: await seriesIdentity(
      room,
      name,
      body.fromRoomId ? String(body.fromRoomId) : undefined,
      body.fromToken ? String(body.fromToken) : undefined,
    ),
  };
  await store.savePlayer(room.id, player);
  return Response.json({ token: player.token });
});
