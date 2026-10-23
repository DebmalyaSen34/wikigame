// Server-only: creating rooms, and chaining rounds so a group can keep playing.

import { after } from "next/server";
import { isOutOfTime, makeRoomCode, type Difficulty, type PageInfo, type Player, type Room } from "./game";
import { BANK_TARGET, bankSize, refillBank, takeFromBank } from "./bank";
import { scoreRound, standings, winners, type RoundScore, type Standing } from "./scoring";
import { store } from "./store";
import { generatePair, measure } from "./distance";
import { getPageInfo, randomPopular, resolveTitle } from "./wiki";
import { randomHardPage } from "./hardPool";

export class RoomInputError extends Error {}

type NewRoom = {
  difficulty: Difficulty;
  createdBy: string;
  start?: string;
  end?: string;
  round?: number;
  prevRoomId?: string;
  avoid?: string[]; // pages this group already played; see generatePair
  seriesId?: string; // set for rounds 2+ of a game
  totalRounds?: number;
  timeLimitSec?: number;
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
  let infos: [PageInfo, PageInfo] | null = null;
  let usedBefore = input.avoid ?? [];
  if (!startInput && !endInput) {
    // Usually straight from the bank of pre-verified pairs: no Wikipedia requests.
    const banked = await takeFromBank(difficulty, usedBefore).catch(() => null);
    if (banked) {
      ({ start, end, par } = banked);
      infos = [banked.startInfo, banked.endInfo];
    } else {
      const generated = await generatePair(difficulty, usedBefore);
      if (!generated) throw new RoomInputError("Couldn't find a fitting pair of pages in time, try again");
      ({ start, end, par } = generated.pair);
      if (generated.reset) usedBefore = []; // every page has had a turn; start the list over
    }
    topUpBankLater(difficulty);
  } else {
    const pick = (role: "start" | "end", exclude: string) =>
      difficulty === "hard" ? randomHardPage(role, [exclude]) : randomPopular([exclude]);
    [start, end] = await Promise.all([
      resolveTitle(startInput || pick("start", endInput)),
      resolveTitle(endInput || pick("end", startInput)),
    ]);
    if (!start) throw new RoomInputError(`No Wikipedia article called "${startInput}"`);
    if (!end) throw new RoomInputError(`No Wikipedia article called "${endInput}"`);
    if (start === end) throw new RoomInputError("Start and finish must be different pages");
    par = await measure(start, end).catch(() => null);
  }

  const [startInfo, endInfo] = infos ?? (await Promise.all([getPageInfo(start), getPageInfo(end)]));
  let id = makeRoomCode();
  while (await store.getRoom(id)) id = makeRoomCode();

  const room: Room = {
    id,
    difficulty,
    par,
    round: input.round ?? 1,
    prevRoomId: input.prevRoomId,
    usedPages: [...usedBefore, start, end],
    seriesId: input.seriesId ?? id,
    totalRounds: input.totalRounds,
    timeLimitSec: input.timeLimitSec || undefined,
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

// After responding, add a few pairs if the bank is running low, so it refills
// between the daily cron runs (and fills itself on a fresh deployment).
const TOP_UP_PAIRS = 3;
const TOP_UP_MS = 45_000;
function topUpBankLater(difficulty: Difficulty) {
  try {
    after(async () => {
      if ((await bankSize(difficulty)) < BANK_TARGET[difficulty]) {
        await refillBank(difficulty, Date.now() + TOP_UP_MS, TOP_UP_PAIRS);
      }
    });
  } catch {
    // Not inside a request (e.g. a script): skip the top-up.
  }
}

export const isLastRound = (room: Room) => !!room.totalRounds && (room.round ?? 1) >= room.totalRounds;

// Locks in the final results. Anyone still playing the last round can carry on,
// but finishes after this moment don't score.
export async function endGame(roomId: string): Promise<void> {
  const room = await store.getRoom(roomId);
  if (room && !room.endedAt) await store.saveRoom({ ...room, endedAt: Date.now() });
}

// Done = finished, gave up, or out of time (even if not yet marked as such).
export async function everyoneDone(roomId: string): Promise<boolean> {
  const [room, players] = await Promise.all([store.getRoom(roomId), store.listPlayers(roomId)]);
  return (
    !!room && players.length > 0 && players.every((p) => p.status !== "playing" || isOutOfTime(room, p))
  );
}

// Creates the next round (same difficulty, fresh random pages) and links it
// from this room. Safe to call from several requests at once: a lock lets
// exactly one of them do the work. Returns the next room's id once it exists.
// On the game's last round this ends the game instead and returns null.
export async function startNextRound(roomId: string): Promise<string | null> {
  const room = await store.getRoom(roomId);
  if (!room) return null;
  if (room.nextRoomId) return room.nextRoomId;
  if (isLastRound(room)) {
    await endGame(room.id);
    return null;
  }

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
      avoid: room.usedPages ?? [room.start, room.end],
      seriesId: room.seriesId ?? room.id,
      totalRounds: room.totalRounds,
      timeLimitSec: room.timeLimitSec,
    });
    await store.saveRoom({ ...(fresh ?? room), nextRoomId: next.id });
    return next.id;
  } finally {
    await store.release(lock);
  }
}

// After a game ends: round 1 of a new game with the same settings, linked from
// the last round so everyone still on the results screen is offered it.
export async function startRematch(roomId: string, createdBy: string): Promise<string | null> {
  const room = await store.getRoom(roomId);
  if (!room?.endedAt) return null;
  if (room.nextRoomId) return room.nextRoomId;

  const lock = `next:${room.id}`;
  if (!(await store.claim(lock, 60))) return null;
  try {
    const fresh = await store.getRoom(room.id);
    if (fresh?.nextRoomId) return fresh.nextRoomId;
    const next = await createRoom({
      difficulty: room.difficulty ?? "normal",
      createdBy,
      round: 1,
      totalRounds: room.totalRounds,
      timeLimitSec: room.timeLimitSec,
      prevRoomId: room.id,
      avoid: room.usedPages ?? [room.start, room.end],
    });
    await store.saveRoom({ ...(fresh ?? room), nextRoomId: next.id });
    return next.id;
  } finally {
    await store.release(lock);
  }
}

// Who a new player in `room` is across the game: the same person as the
// player whose token they held in the previous round, or (for someone who
// rejoined by hand) a previous-round player with the same name not already here.
export async function seriesIdentity(
  room: Room,
  name: string,
  fromRoomId?: string,
  fromToken?: string,
): Promise<string | undefined> {
  if (!room.prevRoomId || (room.round ?? 1) === 1) return undefined;
  const taken = new Set((await store.listPlayers(room.id)).map((p) => p.seriesPlayerId ?? p.id));
  const keyOf = (p: Player) => p.seriesPlayerId ?? p.id;
  if (fromRoomId === room.prevRoomId && fromToken) {
    const prev = await store.getPlayer(room.prevRoomId, fromToken);
    if (prev && !taken.has(keyOf(prev))) return keyOf(prev);
  }
  const wanted = name.trim().toLowerCase();
  const match = (await store.listPlayers(room.prevRoomId)).find(
    (p) => p.name.trim().toLowerCase() === wanted && !taken.has(keyOf(p)),
  );
  return match ? keyOf(match) : undefined;
}

export type GameView = {
  totalRounds: number;
  round: number;
  ended: boolean;
  rounds: { roomId: string; round: number; start: string; end: string; scores: RoundScore[] }[];
  standings: Standing[];
  winners: string[]; // keys
  meKey?: string;
};

// Scores for every round of this room's game so far, oldest first.
export async function gameView(roomId: string, token?: string | null): Promise<GameView | null> {
  const current = await store.getRoom(roomId);
  if (!current?.totalRounds) return null; // older rooms: no game, just endless rounds

  const chain: Room[] = [current];
  while (chain.length < current.totalRounds) {
    const prevId = chain[0].prevRoomId;
    const prev = prevId ? await store.getRoom(prevId) : null;
    if (!prev || (prev.seriesId ?? prev.id) !== (current.seriesId ?? current.id)) break;
    chain.unshift(prev);
  }

  const last = chain.at(-1)!;
  const rounds = await Promise.all(
    chain.map(async (room) => {
      const players = await store.listPlayers(room.id);
      const entries = players.map((p) => ({ ...p, key: p.seriesPlayerId ?? p.id }));
      return {
        roomId: room.id,
        round: room.round ?? 1,
        start: room.start,
        end: room.end,
        scores: scoreRound(entries, room.id === last.id ? last.endedAt : undefined),
      };
    }),
  );

  let meKey: string | undefined;
  if (token) {
    const me = await store.getPlayer(current.id, token);
    if (me) meKey = me.seriesPlayerId ?? me.id;
  }
  const table = standings(rounds.map((r) => r.scores));
  return {
    totalRounds: current.totalRounds,
    round: current.round ?? 1,
    ended: !!last.endedAt,
    rounds,
    standings: table,
    winners: last.endedAt ? winners(table).map((s) => s.key) : [],
    meKey,
  };
}
