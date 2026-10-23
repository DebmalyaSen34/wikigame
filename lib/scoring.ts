// Points across a game of several rounds. Pure functions, used by the server
// to compute standings and by the UI to explain them.

import { rankPlayers, type PlayerStatus } from "./game";

// Points for 1st, 2nd, 3rd… finisher in a round. Anyone finishing below
// these still gets LATE_FINISH; giving up or not finishing scores 0.
export const ROUND_POINTS = [10, 7, 5, 4, 3, 2, 1];
const LATE_FINISH = 1;

export const ROUND_OPTIONS = [1, 3, 5, 7, 10];
export const DEFAULT_ROUNDS = 5;

export type RoundEntry = {
  key: string; // the same person across rounds
  name: string;
  status: PlayerStatus;
  clicks: number;
  startedAt: number;
  finishedAt?: number;
};

export type RoundScore = {
  key: string;
  name: string;
  place: number | null; // 1 = won the round; null = didn't finish (in time)
  points: number;
  clicks: number;
};

export type Standing = {
  key: string;
  name: string;
  points: number;
  wins: number;
  finished: number; // rounds finished
  clicks: number; // total clicks over finished rounds (tiebreak)
};

// `cutoff`: when a game was ended early, finishes after this moment don't count.
export function scoreRound(entries: RoundEntry[], cutoff?: number): RoundScore[] {
  const counts = (e: RoundEntry) =>
    e.status === "finished" && (cutoff === undefined || (e.finishedAt ?? Infinity) <= cutoff);
  const finishers = rankPlayers(entries.filter(counts));
  const scores: RoundScore[] = finishers.map((e, i) => ({
    key: e.key,
    name: e.name,
    place: i + 1,
    points: ROUND_POINTS[i] ?? LATE_FINISH,
    clicks: e.clicks,
  }));
  for (const e of entries) {
    if (!counts(e)) scores.push({ key: e.key, name: e.name, place: null, points: 0, clicks: e.clicks });
  }
  return scores;
}

// Most points wins; ties go to more round wins, then fewer total clicks.
export function standings(rounds: RoundScore[][]): Standing[] {
  const byKey = new Map<string, Standing>();
  for (const round of rounds) {
    for (const s of round) {
      const t = byKey.get(s.key) ?? { key: s.key, name: s.name, points: 0, wins: 0, finished: 0, clicks: 0 };
      t.name = s.name; // latest name, in case it changed
      t.points += s.points;
      if (s.place === 1) t.wins++;
      if (s.place !== null) {
        t.finished++;
        t.clicks += s.clicks;
      }
      byKey.set(s.key, t);
    }
  }
  return [...byKey.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.clicks - b.clicks);
}

// Everyone tied with the leader on points, wins and clicks shares the win.
export function winners(table: Standing[]): Standing[] {
  const [top] = table;
  if (!top || top.points === 0) return [];
  return table.filter((s) => s.points === top.points && s.wins === top.wins && s.clicks === top.clicks);
}
