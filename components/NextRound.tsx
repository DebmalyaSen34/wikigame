"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/client";
import type { PlayerStatus, RoomView } from "@/lib/game";
import { Spinner } from "./Spinner";

const COUNTDOWN_S = 5;
const NUDGE_AFTER_MS = 12_000; // if the server hasn't set up the next round by now, ask it again

// Rolls everyone into the next round: once all players are done the server
// creates it, and this counts down and joins it under the same name.
export function NextRound({
  view,
  myName,
  myStatus,
}: {
  view: RoomView;
  myName?: string;
  myStatus?: PlayerStatus;
}) {
  const { room, players } = view;
  const round = room.round ?? 1;
  const [startedId, setStartedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = room.nextRoomId ?? startedId;
  const stillPlaying = players.filter((p) => p.status === "playing").length;
  const done = myStatus !== undefined && myStatus !== "playing";
  const everyoneDone = players.length > 0 && stillPlaying === 0;

  async function startNow() {
    const token = getToken(room.id);
    if (!token) return;
    setStarting(true);
    setError(null);
    try {
      const res = await api<{ nextRoomId: string | null }>(`/api/rooms/${room.id}/next`, { json: { token } });
      if (res.nextRoomId) setStartedId(res.nextRoomId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  // Everyone's done but no next round yet: normally the server is already on
  // it; if it still hasn't appeared after a while, ask again.
  useEffect(() => {
    if (!done || !everyoneDone || nextId) return;
    const t = setTimeout(() => {
      const token = getToken(room.id);
      if (!token) return;
      api<{ nextRoomId: string | null }>(`/api/rooms/${room.id}/next`, { json: { token } }).then(
        (r) => r.nextRoomId && setStartedId(r.nextRoomId),
        () => {},
      );
    }, NUDGE_AFTER_MS);
    return () => clearTimeout(t);
  }, [done, everyoneDone, nextId, room.id]);

  // Someone who never joined this round just gets a link.
  if (myStatus === undefined) {
    return nextId ? (
      <Link href={`/r/${nextId}`} className="btn-secondary self-start">
        Round {round + 1} is ready →
      </Link>
    ) : null;
  }

  // Still racing while others moved on: don't interrupt, just say so.
  if (!done) {
    return nextId ? (
      <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
        Round {round + 1} has started. Finish this one first, or{" "}
        <JoinLink nextId={nextId} name={myName} label="jump in now" />.
      </p>
    ) : null;
  }

  if (nextId) return <Countdown key={nextId} nextId={nextId} name={myName} round={round + 1} />;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm">
      {everyoneDone ? (
        <p className="flex items-center gap-2 font-medium">
          <Spinner /> Everyone&apos;s done. Setting up round {round + 1}…
        </p>
      ) : (
        <>
          <p>
            <span className="font-medium">
              Waiting for {stillPlaying} player{stillPlaying === 1 ? "" : "s"} to finish.
            </span>{" "}
            <span className="text-muted">Round {round + 1} starts automatically when everyone&apos;s done.</span>
          </p>
          <button onClick={startNow} disabled={starting} className="btn-secondary gap-2 self-start">
            {starting && <Spinner />}
            {starting ? "Picking the next pages…" : "Start next round now"}
          </button>
        </>
      )}
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

function useJoin(nextId: string, name?: string) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function join() {
    setJoining(true);
    setError(null);
    try {
      if (!getToken(nextId)) {
        const { token } = await api<{ token: string }>(`/api/rooms/${nextId}/join`, {
          json: { name: name || "Player" },
        });
        setToken(nextId, token);
      }
      router.push(`/r/${nextId}/play`);
    } catch (e) {
      setError((e as Error).message);
      setJoining(false);
    }
  }
  return { join, joining, error };
}

function JoinLink({ nextId, name, label }: { nextId: string; name?: string; label: string }) {
  const { join, joining } = useJoin(nextId, name);
  return (
    <button onClick={join} disabled={joining} className="font-medium text-accent underline-offset-2 hover:underline">
      {joining ? "joining…" : label}
    </button>
  );
}

function Countdown({ nextId, name, round }: { nextId: string; name?: string; round: number }) {
  const { join, joining, error } = useJoin(nextId, name);
  const [left, setLeft] = useState(COUNTDOWN_S);
  const [stayed, setStayed] = useState(false);
  const [pair, setPair] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<RoomView>(`/api/rooms/${nextId}`).then(
      (v) => !cancelled && setPair({ start: v.room.start, end: v.room.end }),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [nextId]);

  useEffect(() => {
    if (stayed || joining) return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [stayed, joining]);

  useEffect(() => {
    if (left <= 0 && !stayed && !joining && !error) join();
    // join() is recreated each render; firing once when the timer hits zero is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, stayed, joining, error]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/50 bg-accent/10 p-4 text-sm">
      <div>
        <p className="font-semibold">Round {round} is ready</p>
        <p className="text-muted">{pair ? `${pair.start} → ${pair.end}` : "Loading the pages…"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={join} disabled={joining} className="btn-primary gap-2">
          {joining && <Spinner />}
          {joining ? "Joining…" : stayed ? `Join round ${round}` : `Starting in ${Math.max(0, left)}…`}
        </button>
        {!stayed && !joining && (
          <button onClick={() => setStayed(true)} className="btn-secondary">
            Stay here
          </button>
        )}
      </div>
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
