// Shared game types and pure helpers (safe to import from client components).

export type PageInfo = {
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: string;
};

export type Room = {
  id: string;
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
  clicks: number;
  status: PlayerStatus;
  startedAt: number;
  finishedAt?: number;
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
  return reveal ? { ...base, current: p.path.at(-1), path: p.path } : base;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
