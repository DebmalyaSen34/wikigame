"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/client";
import { ROUND_POINTS } from "@/lib/scoring";
import type { GameView } from "@/lib/rooms";

const POLL_MS = 4000;

// Points per player across the game's rounds, and the winner once it's over.
export function GameStandings({ roomId }: { roomId: string }) {
  const [game, setGame] = useState<GameView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const token = getToken(roomId);
      fetch(`/api/rooms/${roomId}/game`, { headers: token ? { "x-player-token": token } : {}, cache: "no-store" })
        .then((r) => (r.status === 200 ? r.json() : null))
        .then((g: GameView | null) => !cancelled && setGame(g), () => {});
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [roomId]);

  if (!game) return null;
  const winners = game.standings.filter((s) => game.winners.includes(s.key));
  const names = (xs: { name: string }[]) =>
    xs.length <= 2 ? xs.map((x) => x.name).join(" and ") : `${xs.slice(0, -1).map((x) => x.name).join(", ")} and ${xs.at(-1)!.name}`;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{game.ended ? "Final results" : "Game standings"}</h2>
        <span className="text-sm text-muted">
          {game.ended ? `${game.totalRounds} rounds played` : `Round ${game.round} of ${game.totalRounds}`}
        </span>
      </div>

      {game.ended && (
        <div className="rounded-xl border border-target bg-target/15 px-4 py-3">
          {winners.length ? (
            <p className="font-serif text-xl font-semibold">
              🏆 {names(winners)} {winners.length === 1 ? "wins" : "share the win"} with {winners[0].points} points!
            </p>
          ) : (
            <p className="font-serif text-xl font-semibold">Nobody scored this game.</p>
          )}
        </div>
      )}

      <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {game.standings.map((s, i) => (
          <li
            key={s.key}
            className={`flex items-center gap-3 px-3 py-2.5 ${s.key === game.meKey ? "bg-accent/5" : ""}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                game.winners.includes(s.key) ? "bg-target text-black" : "bg-border/60 text-muted"
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {s.name}
              {s.key === game.meKey && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}
            </span>
            <span className="text-xs text-muted">
              {s.wins} win{s.wins === 1 ? "" : "s"}
            </span>
            <span className="w-16 text-right font-mono text-sm tabular-nums">
              <strong>{s.points}</strong> <span className="text-muted">pts</span>
            </span>
          </li>
        ))}
      </ol>

      {game.rounds.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Points by round</summary>
          <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="px-3 py-2 font-medium">Round</th>
                  {game.standings.map((s) => (
                    <th key={s.key} className="px-3 py-2 text-right font-medium">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {game.rounds.map((r) => (
                  <tr key={r.roomId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="font-medium">{r.round}</span>{" "}
                      <span className="text-muted">
                        {r.start} → {r.end}
                      </span>
                    </td>
                    {game.standings.map((s) => {
                      const sc = r.scores.find((x) => x.key === s.key);
                      return (
                        <td key={s.key} className="px-3 py-2 text-right font-mono tabular-nums">
                          {sc ? sc.points : <span className="text-muted">–</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            Each round: {ROUND_POINTS.join(", ")} points for 1st, 2nd, 3rd… finisher (fewest clicks, then fastest), 1
            for later finishers, 0 for giving up or not finishing. Ties overall go to more round wins, then fewer total
            clicks.
          </p>
        </details>
      )}
    </section>
  );
}
