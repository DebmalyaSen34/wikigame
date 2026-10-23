"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { RoomView } from "./game";

// Each browser remembers its secret player token per room, so refreshing or
// reopening the link resumes the same game.
const tokenKey = (roomId: string) => `wikigame:token:${roomId.toUpperCase()}`;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export const getToken = (roomId: string) => safeGet(tokenKey(roomId));
export const setToken = (roomId: string, token: string) => safeSet(tokenKey(roomId), token);
export function clearToken(roomId: string) {
  try {
    localStorage.removeItem(tokenKey(roomId));
  } catch {}
}
export const getSavedName = () => safeGet("wikigame:name") ?? "";
export const saveName = (name: string) => safeSet("wikigame:name", name);

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    method: init?.json !== undefined ? "POST" : init?.method,
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

// Polls the room every few seconds so the leaderboard updates as friends play.
export function useRoomView(roomId: string, intervalMs = 3000) {
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const token = getToken(roomId);
      api<RoomView>(`/api/rooms/${roomId}`, {
        headers: token ? { "x-player-token": token } : {},
        cache: "no-store",
      }).then(
        (v) => {
          if (cancelled) return;
          setView(v);
          setError(null);
        },
        (e) => !cancelled && setError((e as Error).message),
      );
    };
    load();
    const t = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [roomId, intervalMs, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { view, error, refresh };
}

// Reads browser-only values (localStorage, location) without a hydration mismatch.
const noopSubscribe = () => () => {};
export function useBrowserValue<T extends string | boolean>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => serverValue);
}

// Re-renders every second, for live timers.
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
