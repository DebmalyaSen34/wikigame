"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, getSavedName, getToken, saveName, setToken, useBrowserValue, useRoomView } from "@/lib/client";
import { Leaderboard } from "@/components/Leaderboard";
import { PageCard } from "@/components/PageCard";
import { DifficultyInfo } from "@/components/DifficultyInfo";
import { RouteGraph, type GraphPlayer } from "@/components/RouteGraph";
import { DIFFICULTIES } from "@/lib/game";
import { roomShareUrl } from "@/lib/site";
import { Spinner } from "@/components/Spinner";
import { NextRound } from "@/components/NextRound";

// Keyed by room so moving to another room (e.g. the next round) starts from
// a clean slate instead of briefly showing the previous room's state.
export function Lobby() {
  const { id } = useParams<{ id: string }>();
  return <LobbyRoom key={id.toUpperCase()} roomId={id.toUpperCase()} />;
}

function LobbyRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { view, error } = useRoomView(roomId);
  const savedName = useBrowserValue(getSavedName, "");
  const [editedName, setName] = useState<string | null>(null);
  const name = editedName ?? savedName;
  const hasToken = useBrowserValue(() => !!getToken(roomId), false);
  const shareUrl = useBrowserValue(() => roomShareUrl(roomId, window.location.origin), "");
  const canNativeShare = useBrowserValue(() => typeof navigator.share === "function", false);
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "invite" | null>(null);

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

  async function copy(what: "link" | "invite", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }

  // Phones get the system share sheet (WhatsApp, Messages…); elsewhere the invite is copied.
  async function share(text: string) {
    if (canNativeShare) {
      try {
        await navigator.share({ title: "WikiRace", text, url: shareUrl });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // closed the share sheet
      }
    }
    copy("invite", `${text}\n${shareUrl}`);
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
  if (!view) {
    return (
      <main className="flex flex-1 items-center justify-center gap-2 text-muted">
        <Spinner /> Loading room…
      </main>
    );
  }

  const { room } = view;
  const me = view.players.find((p) => p.id === view.meId);
  const invite = `Race me on WikiRace: get from ${room.start} to ${room.end} in the fewest clicks (${DIFFICULTIES[room.difficulty ?? "normal"].label}).`;
  // Only includes routes this viewer is allowed to see (their own, or everyone's once they're done).
  const routes = view.players.filter((p) => p.path) as GraphPlayer[];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6 sm:gap-6 sm:py-10">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="font-serif text-2xl font-semibold">
          WikiRace
        </Link>
        <div className="flex items-center gap-2">
          {(room.round ?? 1) > 1 && <span className="text-sm text-muted">Round {room.round}</span>}
          <span className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-sm">{room.id}</span>
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <PageCard label="From" info={room.startInfo} />
        <span className="self-center text-2xl text-muted" aria-hidden>
          →
        </span>
        <PageCard label="To" info={room.endInfo} highlight />
      </div>
      <DifficultyInfo room={room} revealRoute={view.viewerDone} />
      <NextRound view={view} myName={me?.name} myStatus={me?.status} />
      {room.prevRoomId && (
        <Link href={`/r/${room.prevRoomId}`} className="text-sm text-muted underline-offset-2 hover:underline">
          ← Round {(room.round ?? 2) - 1} results
        </Link>
      )}
      {room.endInfo.extract && (
        <p className="rounded-xl border border-border bg-surface p-4 font-serif text-sm leading-relaxed text-muted">
          <span className="font-sans font-medium text-foreground">About the target: </span>
          {room.endInfo.extract}
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Invite friends</h2>
        <p className="text-sm text-muted">
          Send them this link, or the room code <span className="font-mono font-semibold text-foreground">{room.id}</span>.
          Everyone races the same two pages, whenever suits them.
        </p>
        <div className="flex gap-2">
          <input readOnly value={shareUrl} className="input min-w-0 flex-1 font-mono text-sm" onFocus={(e) => e.target.select()} />
          <button onClick={() => copy("link", shareUrl)} className="btn-secondary w-28 shrink-0">
            {copied === "link" ? "Copied" : "Copy link"}
          </button>
        </div>
        <button onClick={() => share(invite)} className="btn-secondary self-start">
          {copied === "invite" ? "Invite copied" : canNativeShare ? "Share invite…" : "Copy invite message"}
        </button>
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
            <button disabled={busy || !name.trim()} className="btn-primary gap-2">
              {busy && <Spinner />}
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
