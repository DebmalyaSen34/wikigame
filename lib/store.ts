// Persistence for rooms and players.
//
// - If Upstash Redis credentials are set (UPSTASH_REDIS_REST_URL/TOKEN, or the
//   KV_REST_API_URL/TOKEN pair Vercel injects), data lives in Redis. Use this
//   when deploying, since serverless functions have no shared disk.
// - Otherwise data is written to JSON files under .data/ (local dev).
//
// Players are stored one record each, so friends clicking at the same time
// never overwrite each other's progress.

import { promises as fs } from "fs";
import path from "path";
import type { Player, Room } from "./game";

interface Store {
  getRoom(id: string): Promise<Room | null>;
  saveRoom(room: Room): Promise<void>;
  getPlayer(roomId: string, token: string): Promise<Player | null>;
  savePlayer(roomId: string, player: Player): Promise<void>;
  listPlayers(roomId: string): Promise<Player[]>;
  // A short-lived lock: true for exactly one caller until it expires or is released.
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  release(key: string): Promise<void>;
  // Adds one to a counter that disappears after ttlSeconds; returns the new count.
  count(key: string, ttlSeconds: number): Promise<number>;
  // Small JSON values that aren't rooms or players (e.g. the pair bank).
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown): Promise<void>;
}

const TTL_SECONDS = 60 * 60 * 24 * 7; // rooms expire after a week in Redis

function redisStore(url: string, token: string): Store {
  async function cmd(...args: (string | number)[]) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }
  return {
    async getRoom(id) {
      const raw = await cmd("GET", `room:${id}`);
      return raw ? JSON.parse(raw) : null;
    },
    async saveRoom(room) {
      await cmd("SET", `room:${room.id}`, JSON.stringify(room), "EX", TTL_SECONDS);
    },
    async getPlayer(roomId, tok) {
      const raw = await cmd("HGET", `room:${roomId}:players`, tok);
      return raw ? JSON.parse(raw) : null;
    },
    async savePlayer(roomId, player) {
      const key = `room:${roomId}:players`;
      await cmd("HSET", key, player.token, JSON.stringify(player));
      await cmd("EXPIRE", key, TTL_SECONDS);
    },
    async listPlayers(roomId) {
      const flat: string[] = (await cmd("HGETALL", `room:${roomId}:players`)) ?? [];
      const out: Player[] = [];
      for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i]));
      return out;
    },
    async claim(key, ttlSeconds) {
      return (await cmd("SET", `lock:${key}`, "1", "NX", "EX", ttlSeconds)) === "OK";
    },
    async release(key) {
      await cmd("DEL", `lock:${key}`);
    },
    async count(key, ttlSeconds) {
      const n = Number(await cmd("INCR", `count:${key}`));
      if (n === 1) await cmd("EXPIRE", `count:${key}`, ttlSeconds);
      return n;
    },
    async getJson(key) {
      const raw = await cmd("GET", `json:${key}`);
      return raw ? JSON.parse(raw) : null;
    },
    async setJson(key, value) {
      await cmd("SET", `json:${key}`, JSON.stringify(value));
    },
  };
}

function fileStore(root: string): Store {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");
  const roomDir = (id: string) => path.join(root, safe(id));
  async function readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return null;
    }
  }
  async function writeJson(file: string, value: unknown) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2));
    await fs.rename(tmp, file);
  }
  return {
    getRoom: (id) => readJson(path.join(roomDir(id), "room.json")),
    saveRoom: (room) => writeJson(path.join(roomDir(room.id), "room.json"), room),
    getPlayer: (roomId, tok) => readJson(path.join(roomDir(roomId), "players", `${safe(tok)}.json`)),
    savePlayer: (roomId, p) => writeJson(path.join(roomDir(roomId), "players", `${safe(p.token)}.json`), p),
    async listPlayers(roomId) {
      const dir = path.join(roomDir(roomId), "players");
      let files: string[] = [];
      try {
        files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
      } catch {
        return [];
      }
      const players = await Promise.all(files.map((f) => readJson<Player>(path.join(dir, f))));
      return players.filter((p): p is Player => p !== null);
    },
    async claim(key, ttlSeconds) {
      const file = path.join(root, "_locks", `${safe(key)}.lock`);
      await fs.mkdir(path.dirname(file), { recursive: true });
      try {
        const stat = await fs.stat(file);
        if (Date.now() - stat.mtimeMs < ttlSeconds * 1000) return false;
        await fs.unlink(file); // expired
      } catch {}
      try {
        await fs.writeFile(file, String(Date.now()), { flag: "wx" }); // fails if someone else just created it
        return true;
      } catch {
        return false;
      }
    },
    async release(key) {
      await fs.unlink(path.join(root, "_locks", `${safe(key)}.lock`)).catch(() => {});
    },
    async count(key, ttlSeconds) {
      // Local dev is a single process, so memory is enough.
      const now = Date.now();
      const hit = counters.get(key);
      const entry = hit && hit.expires > now ? hit : { n: 0, expires: now + ttlSeconds * 1000 };
      entry.n++;
      counters.set(key, entry);
      return entry.n;
    },
    getJson: (key) => readJson(path.join(root, "_json", `${safe(key)}.json`)),
    setJson: (key, value) => writeJson(path.join(root, "_json", `${safe(key)}.json`), value),
  };
}

const counters = new Map<string, { n: number; expires: number }>();

const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export class StoreNotConfiguredError extends Error {
  constructor() {
    super(
      "Room storage isn't set up on this deployment. In Vercel, open the project's Storage tab, " +
        "connect an Upstash for Redis database to it, then redeploy.",
    );
  }
}

// Vercel's filesystem is read-only and not shared between requests, so local
// files can't hold rooms there. Fail every call with a clear message instead.
function unconfiguredStore(): Store {
  const fail = async (): Promise<never> => {
    throw new StoreNotConfiguredError();
  };
  return {
    getRoom: fail,
    saveRoom: fail,
    getPlayer: fail,
    savePlayer: fail,
    listPlayers: fail,
    claim: fail,
    release: fail,
    count: fail,
    getJson: fail,
    setJson: fail,
  };
}

export const store: Store =
  redisUrl && redisToken
    ? redisStore(redisUrl, redisToken)
    : process.env.VERCEL
      ? unconfiguredStore()
      : fileStore(path.join(process.cwd(), ".data", "rooms"));
