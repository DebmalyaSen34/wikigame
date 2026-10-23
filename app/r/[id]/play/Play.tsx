"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, clearToken, getToken, useNow, useRoomView } from "@/lib/client";
import { loadArticle, prefetchArticle, type Article } from "@/lib/articles";
import { DIFFICULTIES, formatDuration, parText, type Player } from "@/lib/game";
import { Leaderboard } from "@/components/Leaderboard";
import { RouteGraph, type GraphPlayer } from "@/components/RouteGraph";
import { DifficultyBadge } from "@/components/DifficultyInfo";
import { ArticleSkeleton, ProgressBar } from "@/components/Spinner";
import { NextRound } from "@/components/NextRound";

type Me = Omit<Player, "token">;
type Action = "state" | "click" | "back" | "giveup";
type MoveResponse = { me: Me; article: { title: string; displayTitle: string }; hints: string[] };
type Loaded = { res: MoveResponse; article: Article };

const HOVER_PREFETCH_MS = 80;

// Keyed by room so moving to another room (e.g. the next round) starts from
// a clean slate instead of briefly showing the previous room's state.
export function Play() {
  const { id } = useParams<{ id: string }>();
  return <PlayRoom key={id.toUpperCase()} roomId={id.toUpperCase()} />;
}

function PlayRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { view, refresh } = useRoomView(roomId);
  const [me, setMe] = useState<Me | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null); // link being opened
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [targetOpen, setTargetOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false); // route + leaderboard sheet on small screens
  const contentRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useNow(me?.status === "playing");

  const post = useCallback(
    async (action: Action, to?: string) => {
      const token = getToken(roomId);
      if (!token) {
        router.replace(`/r/${roomId}`);
        return null;
      }
      try {
        return await api<MoveResponse>(`/api/rooms/${roomId}/play`, { json: { token, action, to } });
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

  // The move goes to the server while the page itself comes from the CDN (or
  // was already prefetched), so a click waits for whichever is slower, not both.
  const run = useCallback(
    async (action: Action, to?: string): Promise<Loaded | null> => {
      const early = action === "click" && to ? loadArticle(to).catch(() => null) : null;
      const res = await post(action, to);
      if (!res) return null;
      let page = early ? await early : null;
      if (!page || page.title !== res.article.title) page = await loadArticle(res.article.title);
      return { res, article: page };
    },
    [post],
  );

  const apply = useCallback((loaded: Loaded | null) => {
    if (!loaded) return;
    setMe(loaded.res.me);
    setArticle(loaded.article);
    setHints(loaded.res.hints ?? []);
    setLoading(false);
    setPending(null);
  }, []);

  const fail = useCallback((e: unknown) => {
    setError((e as Error).message);
    setLoading(false);
    setPending(null);
  }, []);

  // Resume wherever this player left off.
  useEffect(() => {
    let cancelled = false;
    run("state").then(
      (r) => !cancelled && apply(r),
      (e) => !cancelled && fail(e),
    );
    return () => {
      cancelled = true;
    };
  }, [run, apply, fail]);

  function send(action: Exclude<Action, "state">, to?: string) {
    setLoading(true);
    setPending(to ?? null);
    setError(null);
    run(action, to).then((r) => {
      apply(r);
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

  const linkTitle = (e: React.SyntheticEvent) =>
    (e.target as HTMLElement).closest?.("a[data-wiki]")?.getAttribute("data-wiki") ?? null;

  // Start loading a page as soon as the player shows interest in a link.
  function onLinkHover(e: React.MouseEvent) {
    const t = linkTitle(e);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (t) hoverTimer.current = setTimeout(() => prefetchArticle(t), HOVER_PREFETCH_MS);
  }
  function onLinkTouch(e: React.SyntheticEvent) {
    const t = linkTitle(e);
    if (t) prefetchArticle(t);
  }

  function giveUp() {
    if (confirm("Give up this round? You'll see everyone's routes, but you'll be ranked last.")) send("giveup");
  }

  const room = view?.room;
  const playing = me?.status === "playing";
  const rules = DIFFICULTIES[room?.difficulty ?? "normal"];

  // Easy mode: mark the links the server says lead toward the target.
  useEffect(() => {
    const set = new Set(hints);
    contentRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-wiki]").forEach((a) => {
      a.classList.toggle("wg-hint", set.has(a.dataset.wiki!));
    });
  }, [article, hints]);

  // Show which link is loading.
  useEffect(() => {
    contentRef.current?.querySelectorAll<HTMLAnchorElement>("a.wg-loading").forEach((a) => a.classList.remove("wg-loading"));
    if (!pending) return;
    contentRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-wiki]").forEach((a) => {
      if (a.dataset.wiki === pending) a.classList.add("wg-loading");
    });
  }, [pending, article]);

  // Everyone whose route this viewer may see, with this player's own entry
  // taken from the fresher play state rather than the polled leaderboard.
  const graphPlayers = useMemo<GraphPlayer[]>(() => {
    if (!me) return [];
    const others = (view?.players ?? []).filter((p) => p.id !== me.id && p.path) as GraphPlayer[];
    return [me, ...others];
  }, [me, view]);
  const elapsed = me ? (me.finishedAt ?? now) - me.startedAt : 0;
  const myRank = view && me ? view.players.findIndex((p) => p.id === me.id) + 1 : 0;

  const sidebar = (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Your route</h2>
        {me && room ? (
          <RouteGraph players={[me]} start={room.start} end={room.end} meId={me.id} orientation="vertical" />
        ) : (
          <div className="h-24 animate-pulse rounded-xl bg-border/50" />
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Leaderboard</h2>
        {view ? (
          <Leaderboard players={view.players} meId={view.meId} compact revealed={view.viewerDone} />
        ) : (
          <div className="h-16 animate-pulse rounded-xl bg-border/50" />
        )}
      </section>
    </>
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <Link href={`/r/${roomId}`} className="order-1 font-serif text-lg font-semibold sm:text-xl">
            WikiRace
          </Link>

          {/* On phones the target gets its own full-width row, so it's never cut off. */}
          <button
            type="button"
            onClick={() => setTargetOpen((o) => !o)}
            aria-expanded={targetOpen}
            className="order-3 flex w-full min-w-0 items-center gap-2 rounded-lg text-left text-sm sm:order-2 sm:w-auto sm:flex-1"
          >
            <span className="shrink-0 text-muted">Target</span>
            <span className="min-w-0 break-words rounded-md bg-target/40 px-2 py-0.5 font-semibold sm:truncate">
              {room?.end ?? "…"}
            </span>
            {room && <DifficultyBadge room={room} />}
            <span className={`shrink-0 text-xs text-muted transition-transform ${targetOpen ? "rotate-180" : ""}`} aria-hidden>
              ▾
            </span>
          </button>

          <div className="order-2 ml-auto flex items-center gap-3 font-mono text-sm tabular-nums sm:order-3 sm:ml-0">
            <span>
              <strong className="text-base">{me?.clicks ?? 0}</strong>{" "}
              <span className="text-muted">{me?.clicks === 1 ? "click" : "clicks"}</span>
            </span>
            <span className="text-muted">{formatDuration(elapsed)}</span>
          </div>

          {playing && (
            <div className="order-2 flex gap-2 sm:order-4">
              {rules.backAllowed && (
                <button
                  onClick={() => send("back")}
                  disabled={loading || (me?.stack.length ?? 0) < 2}
                  className="btn-secondary h-9 px-3 text-sm"
                  title={rules.backCosts ? "Going back costs a click" : "Going back is free on Easy"}
                  aria-label="Back"
                >
                  ←<span className="hidden sm:inline">&nbsp;Back</span>
                </button>
              )}
              <button onClick={giveUp} disabled={loading} className="btn-secondary h-9 px-3 text-sm text-danger">
                Give up
              </button>
            </div>
          )}
        </div>

        {targetOpen && room && (
          <div className="mx-auto flex max-w-6xl gap-3 px-4 pb-3 text-sm">
            {room.endInfo.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={room.endInfo.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">{room.end}</p>
              {room.endInfo.description && <p className="text-muted">{room.endInfo.description}</p>}
              {room.endInfo.extract && (
                <p className="mt-1 line-clamp-3 font-serif text-muted sm:line-clamp-none">{room.endInfo.extract}</p>
              )}
            </div>
          </div>
        )}

        <ProgressBar active={loading} />
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:py-6">
        <main className="min-w-0 pb-20 lg:pb-0">
          {view && me && (
            <div className="mb-4 flex flex-col empty:hidden">
              <NextRound view={view} myName={me.name} myStatus={me.status} />
            </div>
          )}
          {me && !playing && (
            <div
              className={`mb-6 flex flex-col gap-2 rounded-2xl border p-4 sm:p-5 ${
                me.status === "finished" ? "border-success bg-success/10" : "border-border bg-surface"
              }`}
            >
              <p className="font-serif text-2xl font-semibold">
                {(room?.round ?? 1) > 1 && <span className="mr-2 text-base font-normal text-muted">Round {room?.round}</span>}
                {me.status === "finished"
                  ? `You made it in ${me.clicks} click${me.clicks === 1 ? "" : "s"}!`
                  : "You gave up this round."}
              </p>
              <p className="text-sm text-muted">
                Time {formatDuration(elapsed)} · Route: {me.path.join(" → ")}
              </p>
              {room && parText(room.par) && (
                <p className="text-sm text-muted">
                  {parText(room.par)}
                  {room.par && "via" in room.par && room.par.via && ` (e.g. ${room.start} → ${room.par.via} → ${room.end})`}
                </p>
              )}
              {room && (
                <div className="mt-2">
                  <RouteGraph players={graphPlayers} start={room.start} end={room.end} meId={me.id} />
                </div>
              )}
              <Link href={`/r/${roomId}`} className="btn-primary mt-2 self-start">
                See full results
              </Link>
            </div>
          )}

          {error && (
            <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          {playing && rules.hints && (
            <p className="mb-4 text-sm text-muted">
              <span className="wg-hint-sample">Highlighted links</span> go to the target or to a page that links to it.
              {hints.length === 0 && !loading && " None on this page — try somewhere else."}
            </p>
          )}

          {article ? (
            <article className={`transition-opacity ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
              <h1
                className="mb-4 border-b border-border pb-2 font-serif text-3xl font-semibold sm:text-4xl"
                dangerouslySetInnerHTML={{ __html: article.displayTitle }}
              />
              <div
                ref={contentRef}
                className="wiki"
                onClick={onArticleClick}
                onMouseOver={onLinkHover}
                onTouchStart={onLinkTouch}
                onFocus={onLinkTouch}
                dangerouslySetInnerHTML={{ __html: article.html }}
              />
            </article>
          ) : error ? null : (
            <ArticleSkeleton />
          )}
        </main>

        <aside className="hidden flex-col gap-6 lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
          {sidebar}
        </aside>
      </div>

      {/* Phones and tablets: route + leaderboard live in a sheet instead of below a long article. */}
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="btn-primary fixed bottom-4 right-4 z-20 h-11 gap-2 shadow-lg lg:hidden"
      >
        Route &amp; leaderboard
        {myRank > 0 && <span className="rounded-full bg-accent-ink/20 px-2 text-xs">#{myRank}</span>}
      </button>
      {panelOpen && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label="Route and leaderboard">
          <button className="absolute inset-0 bg-black/50" aria-label="Close" onClick={() => setPanelOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col gap-5 overflow-y-auto rounded-t-2xl border-t border-border bg-background p-4 pb-8">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Route &amp; leaderboard</span>
              <button className="btn-secondary h-9 px-3 text-sm" onClick={() => setPanelOpen(false)}>
                Close
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      )}
    </div>
  );
}
