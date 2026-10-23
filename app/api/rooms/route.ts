import { DIFFICULTIES, type Difficulty } from "@/lib/game";
import { DEFAULT_ROUNDS, ROUND_OPTIONS } from "@/lib/scoring";
import { createRoom, RoomInputError } from "@/lib/rooms";
import { withErrors } from "@/lib/api";
import { StoreNotConfiguredError } from "@/lib/store";

// POST /api/rooms { name, difficulty?, rounds?, start?, end? } -> { id }
export const POST = withErrors(async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const difficulty: Difficulty = body.difficulty in DIFFICULTIES ? body.difficulty : "normal";
  const totalRounds = ROUND_OPTIONS.includes(Number(body.rounds)) ? Number(body.rounds) : DEFAULT_ROUNDS;
  try {
    const room = await createRoom({
      difficulty,
      totalRounds,
      createdBy: String(body.name ?? "").trim().slice(0, 24) || "Someone",
      start: String(body.start ?? ""),
      end: String(body.end ?? ""),
    });
    return Response.json({ id: room.id });
  } catch (e) {
    if (e instanceof RoomInputError) {
      const status = e.message.startsWith("Couldn't find") ? 503 : 400;
      return Response.json({ error: e.message }, { status });
    }
    if (e instanceof StoreNotConfiguredError) throw e; // reported by withErrors
    // Usually Wikipedia being slow or rate-limiting us; its message says which.
    return Response.json({ error: (e as Error).message || "Couldn't reach Wikipedia, try again" }, { status: 502 });
  }
});
