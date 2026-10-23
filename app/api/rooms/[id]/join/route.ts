import type { Player } from "@/lib/game";
import { store } from "@/lib/store";

// POST /api/rooms/:id/join { name } -> { token }. The clock starts now.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[id]/join">) {
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
  };
  await store.savePlayer(room.id, player);
  return Response.json({ token: player.token });
}
