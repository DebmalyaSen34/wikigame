// Shared game types and pure helpers (safe to import from client components).

export type PageInfo = {
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: string;
};

export type Difficulty = "easy" | "normal" | "hard";

// What we could prove about the shortest route when the room was made.
export type Par = { clicks: 1 | 2; via?: string } | { atLeast: 3 };

export const DIFFICULTIES: Record<
  Difficulty,
  { label: string; pages: string; rules: string[]; backAllowed: boolean; backCosts: boolean; hints: boolean }
> = {
  easy: {
    label: "Easy",
    pages: "Well-known pages, exactly 2 clicks apart",
    rules: ["Back is free", "Links to pages that mention the target are highlighted"],
    backAllowed: true,
    backCosts: false,
    hints: true,
  },
  normal: {
    label: "Normal",
    pages: "Well-known pages that aren't directly linked",
    rules: ["Back costs a click"],
    backAllowed: true,
    backCosts: true,
    hints: false,
  },
  hard: {
    label: "Hard",
    pages: "Everyday pages everyone knows, at least 3 clicks apart",
    rules: ["No Back button: every click is final"],
    backAllowed: false,
    backCosts: true,
    hints: false,
  },
};

export function parText(par: Par | null | undefined): string | null {
  if (!par) return null;
  if ("atLeast" in par) return "No route shorter than 3 clicks exists";
  return par.clicks === 1 ? "Can be done in 1 click" : "Can be done in 2 clicks";
}

export type Room = {
  id: string;
  difficulty?: Difficulty; // missing on rooms made before difficulties existed (= normal)
  par?: Par | null;
  round?: number; // 1 for the first game; missing on older rooms
  prevRoomId?: string;
  nextRoomId?: string; // set once the next round has been created
  usedPages?: string[]; // start and target pages of every round in this series so far, this one included
  seriesId?: string; // id of the game's first round; shared by all its rounds
  totalRounds?: number; // rounds in this game; missing on older rooms (= endless rounds)
  endedAt?: number; // set on the last round once the game is over
  start: string;
  end: string;
  startInfo: PageInfo;
  endInfo: PageInfo;
  createdAt: number;
  createdBy: string;
};

export type PlayerStatus = "playing" | "finished" | "gaveup";

export type Player = {
  id: string; // public id, shown to other players
  token: string; // secret, only known to this player's browser
  name: string;
  path: string[]; // every page visited, in order (back moves included)
  stack: string[]; // pages the Back button can return to
  backAt?: number[]; // indexes in `path` that were reached with Back rather than a link
  clicks: number;
  status: PlayerStatus;
  startedAt: number;
  finishedAt?: number;
  seriesPlayerId?: string; // the same person across a game's rounds (their id in the round they first joined)
};

export type PublicPlayer = {
  id: string;
  name: string;
  clicks: number;
  status: PlayerStatus;
  startedAt: number;
  finishedAt?: number;
  current?: string; // only revealed once the viewer is done, to avoid spoilers
  path?: string[];
  backAt?: number[];
};

export type RoomView = {
  room: Room;
  players: PublicPlayer[];
  meId?: string;
  viewerDone: boolean;
};

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

export function makeRoomCode(): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

// Finished players first (fewest clicks, then fastest), then those still
// playing (fewest clicks so far), then players who gave up.
export function rankPlayers<T extends Pick<Player, "status" | "clicks" | "startedAt" | "finishedAt">>(
  players: T[],
): T[] {
  const order = { finished: 0, playing: 1, gaveup: 2 } as const;
  return [...players].sort((a, b) => {
    if (a.status !== b.status) return order[a.status] - order[b.status];
    if (a.clicks !== b.clicks) return a.clicks - b.clicks;
    const ta = (a.finishedAt ?? Date.now()) - a.startedAt;
    const tb = (b.finishedAt ?? Date.now()) - b.startedAt;
    return ta - tb;
  });
}

export function toPublic(p: Player, reveal: boolean): PublicPlayer {
  const base: PublicPlayer = {
    id: p.id,
    name: p.name,
    clicks: p.clicks,
    status: p.status,
    startedAt: p.startedAt,
    finishedAt: p.finishedAt,
  };
  return reveal ? { ...base, current: p.path.at(-1), path: p.path, backAt: p.backAt ?? [] } : base;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
