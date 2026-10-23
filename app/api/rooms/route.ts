import { makeRoomCode, type Room } from "@/lib/game";
import { store } from "@/lib/store";
import { getPageInfo, randomPopular, resolveTitle } from "@/lib/wiki";

// POST /api/rooms { name, start?, end? } -> { id }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const createdBy = String(body.name ?? "").trim().slice(0, 24) || "Someone";

  const startInput = String(body.start ?? "").trim() || randomPopular();
  const endInput = String(body.end ?? "").trim() || randomPopular([startInput]);

  let start: string | null, end: string | null;
  try {
    [start, end] = await Promise.all([resolveTitle(startInput), resolveTitle(endInput)]);
  } catch {
    return Response.json({ error: "Couldn't reach Wikipedia, try again" }, { status: 502 });
  }
  if (!start) return Response.json({ error: `No Wikipedia article called "${startInput}"` }, { status: 400 });
  if (!end) return Response.json({ error: `No Wikipedia article called "${endInput}"` }, { status: 400 });
  if (start === end) return Response.json({ error: "Start and finish must be different pages" }, { status: 400 });

  const [startInfo, endInfo] = await Promise.all([getPageInfo(start), getPageInfo(end)]);

  let id = makeRoomCode();
  while (await store.getRoom(id)) id = makeRoomCode();

  const room: Room = { id, start, end, startInfo, endInfo, createdAt: Date.now(), createdBy };
  await store.saveRoom(room);
  return Response.json({ id });
}
