"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, getSavedName, getToken, saveName, setToken, useBrowserValue, useRoomView } from "@/lib/client";
import { Leaderboard } from "@/components/Leaderboard";
import { PageCard } from "@/components/PageCard";
import { RouteGraph, type GraphPlayer } from "@/components/RouteGraph";

export function Lobby() {
  const { id } = useParams<{ id: string }>();
  const roomId = id.toUpperCase();
  const router = useRouter();
  const { view, error } = useRoomView(roomId);
  const savedName = useBrowserValue(getSavedName, "");
  const [editedName, setName] = useState<string | null>(null);
  const name = editedName ?? savedName;
  const hasToken = useBrowserValue(() => !!getToken(roomId), false);
  const shareUrl = useBrowserValue(() => `${window.location.origin}/r/${roomId}`, "");
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setJoinError(null);
    saveName(name.trim());
    try {
      const { token } = await api<{ token: string }>(`/api/rooms/${roomId}/join`, { json: { name } });
      setToken(roomId, token);
      router.push(`/r/${roomId}/play`);
    } catch (e) {
      setJoinError((e as Error).message);
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  if (error && !view) {
    return (
      <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg">{error}</p>
        <Link href="/" className="btn-secondary">
          Back home
        </Link>
      </main>
    );
  }
  if (!view) return <main className="flex flex-1 items-center justify-center text-muted">Loading room…</main>;

  const { room } = view;
  // Only includes routes this viewer is allowed to see (their own, or everyone's once they're done).
  const routes = view.players.filter((p) => p.path) as GraphPlayer[];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="font-serif text-2xl font-semibold">
          WikiRace
        </Link>
        <span className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-sm">{room.id}</span>
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <PageCard label="From" info={room.startInfo} />
        <span className="self-center text-2xl text-muted" aria-hidden>
          →
        </span>
        <PageCard label="To" info={room.endInfo} highlight />
      </div>
      {room.endInfo.extract && (
        <p className="rounded-xl border border-border bg-surface p-4 font-serif text-sm leading-relaxed text-muted">
          <span className="font-sans font-medium text-foreground">About the target: </span>
          {room.endInfo.extract}
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Invite friends</h2>
        <p className="text-sm text-muted">Send them this link. Everyone races the same two pages, whenever suits them.</p>
        <div className="flex gap-2">
          <input readOnly value={shareUrl} className="input min-w-0 flex-1 font-mono text-sm" onFocus={(e) => e.target.select()} />
          <button onClick={copy} className="btn-secondary w-24">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </section>

      {hasToken ? (
        <Link href={`/r/${roomId}/play`} className="btn-primary">
          {view.viewerDone ? "See your game" : "Continue playing"}
        </Link>
      ) : (
        <form onSubmit={join} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Ready?</h2>
          <p className="text-sm text-muted">The clock starts as soon as you press Start.</p>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              className="input min-w-0 flex-1"
            />
            <button disabled={busy || !name.trim()} className="btn-primary">
              {busy ? "Starting…" : "Start"}
            </button>
          </div>
          {joinError && <p className="text-sm text-danger">{joinError}</p>}
        </form>
      )}

      {routes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">{routes.length > 1 ? "Everyone's routes" : "Your route"}</h2>
          <RouteGraph players={routes} start={room.start} end={room.end} meId={view.meId} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Leaderboard</h2>
        <Leaderboard players={view.players} meId={view.meId} revealed={view.viewerDone} />
      </section>
    </main>
  );
}
