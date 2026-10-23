"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, clearToken, getToken, useNow, useRoomView } from "@/lib/client";
import { formatDuration, type Player } from "@/lib/game";
import { Leaderboard } from "@/components/Leaderboard";

type Me = Omit<Player, "token">;
type Article = { title: string; displayTitle: string; html: string };
type PlayResponse = { me: Me; article: Article };

export function Play() {
  const { id } = useParams<{ id: string }>();
  const roomId = id.toUpperCase();
  const router = useRouter();
  const { view, refresh } = useRoomView(roomId);
  const [me, setMe] = useState<Me | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(me?.status === "playing");

  const post = useCallback(
    async (action: "state" | "click" | "back" | "giveup", to?: string) => {
      const token = getToken(roomId);
      if (!token) {
        router.replace(`/r/${roomId}`);
        return null;
      }
      try {
        return await api<PlayResponse>(`/api/rooms/${roomId}/play`, { json: { token, action, to } });
      } catch (e) {
        if ((e as Error).message === "You haven't joined this room") {
          clearToken(roomId);
          router.replace(`/r/${roomId}`);
          return null;
        }
        throw e;
      }
    },
    [roomId, router],
  );

  const apply = useCallback((res: PlayResponse | null) => {
    if (!res) return;
    setMe(res.me);
    setArticle(res.article);
    setLoading(false);
  }, []);

  const fail = useCallback((e: unknown) => {
    setError((e as Error).message);
    setLoading(false);
  }, []);

  // Resume wherever this player left off.
  useEffect(() => {
    let cancelled = false;
    post("state").then(
      (res) => !cancelled && apply(res),
      (e) => !cancelled && fail(e),
    );
    return () => {
      cancelled = true;
    };
  }, [post, apply, fail]);

  function send(action: "click" | "back" | "giveup", to?: string) {
    setLoading(true);
    setError(null);
    post(action, to).then((res) => {
      apply(res);
      window.scrollTo({ top: 0 });
      refresh();
    }, fail);
  }

  // One listener for every link in the article.
  function onArticleClick(e: React.MouseEvent) {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    e.preventDefault();
    const to = link.getAttribute("data-wiki");
    if (!to || loading || me?.status !== "playing") return;
    send("click", to);
  }

  function giveUp() {
    if (confirm("Give up this round? You'll see everyone's routes, but you'll be ranked last.")) send("giveup");
  }

  const room = view?.room;
  const playing = me?.status === "playing";
  const elapsed = me ? (me.finishedAt ?? now) - me.startedAt : 0;

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href={`/r/${roomId}`} className="font-serif text-xl font-semibold">
            WikiRace
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="text-muted">Target:</span>
            <span className="truncate rounded-md bg-target/40 px-2 py-0.5 font-semibold" title={room?.endInfo.description}>
              {room?.end ?? "…"}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-sm tabular-nums">
            <span>
              <strong className="text-base">{me?.clicks ?? 0}</strong>{" "}
              <span className="text-muted">{me?.clicks === 1 ? "click" : "clicks"}</span>
            </span>
            <span className="text-muted">{formatDuration(elapsed)}</span>
          </div>
          {playing && (
            <div className="flex gap-2">
              <button
                onClick={() => send("back")}
                disabled={loading || (me?.stack.length ?? 0) < 2}
                className="btn-secondary h-9 px-3 text-sm"
                title="Going back costs a click"
              >
                ← Back
              </button>
              <button onClick={giveUp} disabled={loading} className="btn-secondary h-9 px-3 text-sm text-danger">
                Give up
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0">
          {me && !playing && (
            <div
              className={`mb-6 flex flex-col gap-2 rounded-2xl border p-5 ${
                me.status === "finished" ? "border-success bg-success/10" : "border-border bg-surface"
              }`}
            >
              <p className="font-serif text-2xl font-semibold">
                {me.status === "finished"
                  ? `You made it in ${me.clicks} click${me.clicks === 1 ? "" : "s"}!`
                  : "You gave up this round."}
              </p>
              <p className="text-sm text-muted">
                Time {formatDuration(elapsed)} · Route: {me.path.join(" → ")}
              </p>
              <Link href={`/r/${roomId}`} className="btn-primary mt-2 self-start">
                See full results
              </Link>
            </div>
          )}

          {error && (
            <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          {article ? (
            <article className={`transition-opacity ${loading ? "opacity-40" : ""}`}>
              <h1
                className="mb-4 border-b border-border pb-2 font-serif text-4xl font-semibold"
                dangerouslySetInnerHTML={{ __html: article.displayTitle }}
              />
              <div
                className="wiki"
                onClick={onArticleClick}
                dangerouslySetInnerHTML={{ __html: article.html }}
              />
            </article>
          ) : (
            <p className="text-muted">Loading article…</p>
          )}
        </main>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Your route</h2>
            <ol className="flex flex-col gap-1 text-sm">
              {me?.path.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-5 shrink-0 text-right font-mono text-xs leading-5 text-muted">{i}</span>
                  <span className={i === me.path.length - 1 ? "font-semibold" : ""}>{t}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Leaderboard</h2>
            {view && <Leaderboard players={view.players} meId={view.meId} compact revealed={view.viewerDone} />}
          </section>
        </aside>
      </div>
    </div>
  );
}
