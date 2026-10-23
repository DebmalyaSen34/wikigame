// Server-only: creating rooms, and chaining rounds so a group can keep playing.

import { makeRoomCode, type Difficulty, type Room } from "./game";
import { store } from "./store";
import { generatePair, measure } from "./distance";
import { getPageInfo, randomArticle, randomPopular, resolveTitle } from "./wiki";

export class RoomInputError extends Error {}

type NewRoom = {
  difficulty: Difficulty;
  createdBy: string;
  start?: string;
  end?: string;
  round?: number;
  prevRoomId?: string;
};

// With both pages blank, picks a pair that matches the difficulty and records
// what it proved about the shortest route. With pages typed in, the difficulty
// only sets the rules, and the route is measured.
export async function createRoom(input: NewRoom): Promise<Room> {
  const { difficulty } = input;
  const startInput = input.start?.trim() ?? "";
  const endInput = input.end?.trim() ?? "";

  let start: string | null, end: string | null;
  let par: Room["par"] = null;
  if (!startInput && !endInput) {
    const pair = await generatePair(difficulty);
    if (!pair) throw new RoomInputError("Couldn't find a fitting pair of pages in time, try again");
    ({ start, end, par } = pair);
  } else {
    const pick = (exclude: string) => (difficulty === "hard" ? randomArticle() : randomPopular([exclude]));
    [start, end] = await Promise.all([
      resolveTitle(startInput || (await pick(endInput))),
      resolveTitle(endInput || (await pick(startInput))),
    ]);
    if (!start) throw new RoomInputError(`No Wikipedia article called "${startInput}"`);
    if (!end) throw new RoomInputError(`No Wikipedia article called "${endInput}"`);
    if (start === end) throw new RoomInputError("Start and finish must be different pages");
    par = await measure(start, end).catch(() => null);
  }

  const [startInfo, endInfo] = await Promise.all([getPageInfo(start), getPageInfo(end)]);
  let id = makeRoomCode();
  while (await store.getRoom(id)) id = makeRoomCode();

  const room: Room = {
    id,
    difficulty,
    par,
    round: input.round ?? 1,
    prevRoomId: input.prevRoomId,
    start,
    end,
    startInfo,
    endInfo,
    createdAt: Date.now(),
    createdBy: input.createdBy,
  };
  await store.saveRoom(room);
  return room;
}

export async function everyoneDone(roomId: string): Promise<boolean> {
  const players = await store.listPlayers(roomId);
  return players.length > 0 && players.every((p) => p.status !== "playing");
}

// Creates the next round (same difficulty, fresh random pages) and links it
// from this room. Safe to call from several requests at once: a lock lets
// exactly one of them do the work. Returns the next room's id once it exists.
export async function startNextRound(roomId: string): Promise<string | null> {
  const room = await store.getRoom(roomId);
  if (!room) return null;
  if (room.nextRoomId) return room.nextRoomId;

  const lock = `next:${room.id}`;
  if (!(await store.claim(lock, 60))) return null; // another request is already creating it
  try {
    const fresh = await store.getRoom(room.id); // it may have been created since we looked
    if (fresh?.nextRoomId) return fresh.nextRoomId;

    const next = await createRoom({
      difficulty: room.difficulty ?? "normal",
      createdBy: room.createdBy,
      round: (room.round ?? 1) + 1,
      prevRoomId: room.id,
    });
    await store.saveRoom({ ...(fresh ?? room), nextRoomId: next.id });
    return next.id;
  } finally {
    await store.release(lock);
  }
}
