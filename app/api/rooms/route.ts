import { DIFFICULTIES, makeRoomCode, type Difficulty, type Room } from "@/lib/game";
import { store } from "@/lib/store";
import { generatePair, measure } from "@/lib/distance";
import { getPageInfo, randomArticle, randomPopular, resolveTitle } from "@/lib/wiki";

// POST /api/rooms { name, difficulty?, start?, end? } -> { id }
//
// With both pages left blank, the server picks a pair that matches the
// difficulty and records what it proved about the shortest route. With pages
// typed in, the difficulty only sets the rules, and the route is measured.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const createdBy = String(body.name ?? "").trim().slice(0, 24) || "Someone";
  const difficulty: Difficulty = body.difficulty in DIFFICULTIES ? body.difficulty : "normal";
  const startInput = String(body.start ?? "").trim();
  const endInput = String(body.end ?? "").trim();

  let start: string | null, end: string | null;
  let par: Room["par"] = null;
  try {
    if (!startInput && !endInput) {
      const pair = await generatePair(difficulty);
      if (!pair) {
        return Response.json({ error: "Couldn't find a fitting pair of pages in time, try again" }, { status: 503 });
      }
      ({ start, end, par } = pair);
    } else {
      const pick = (exclude: string) => (difficulty === "hard" ? randomArticle() : randomPopular([exclude]));
      [start, end] = await Promise.all([
        resolveTitle(startInput || (await pick(endInput))),
        resolveTitle(endInput || (await pick(startInput))),
      ]);
      if (!start) return Response.json({ error: `No Wikipedia article called "${startInput}"` }, { status: 400 });
      if (!end) return Response.json({ error: `No Wikipedia article called "${endInput}"` }, { status: 400 });
      if (start === end) return Response.json({ error: "Start and finish must be different pages" }, { status: 400 });
      par = await measure(start, end).catch(() => null);
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message || "Couldn't reach Wikipedia, try again" }, { status: 502 });
  }

  const [startInfo, endInfo] = await Promise.all([getPageInfo(start), getPageInfo(end)]);

  let id = makeRoomCode();
  while (await store.getRoom(id)) id = makeRoomCode();

  const room: Room = { id, difficulty, par, start, end, startInfo, endInfo, createdAt: Date.now(), createdBy };
  await store.saveRoom(room);
  return Response.json({ id });
}
