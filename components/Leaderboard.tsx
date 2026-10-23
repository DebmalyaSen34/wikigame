"use client";

import { formatDuration, type PublicPlayer } from "@/lib/game";
import { useNow } from "@/lib/client";

const STATUS_LABEL = { finished: "Finished", playing: "Playing", gaveup: "Gave up", timeout: "Out of time" } as const;

export function Leaderboard({
  players,
  meId,
  compact = false,
  revealed,
}: {
  players: PublicPlayer[];
  meId?: string;
  compact?: boolean;
  revealed: boolean;
}) {
  const now = useNow(players.some((p) => p.status === "playing"));

  if (players.length === 0) {
    return <p className="text-sm text-muted">No one has started yet. Be the first.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {players.map((p, i) => {
          const elapsed = (p.finishedAt ?? now) - p.startedAt;
          return (
            <li key={p.id} className={`flex flex-col gap-1.5 px-3 py-2.5 ${p.id === meId ? "bg-accent/5" : ""}`}>
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    p.status === "finished" && i === 0 ? "bg-target text-black" : "bg-border/60 text-muted"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.name}
                  {p.id === meId && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}
                </span>
                <span
                  className={`text-xs ${
                    p.status === "finished" ? "text-success" : p.status === "playing" ? "text-muted" : "text-danger"
                  }`}
                >
                  {STATUS_LABEL[p.status]}
                </span>
                <span className="w-16 text-right font-mono text-sm tabular-nums">
                  {p.clicks} <span className="text-muted">clk</span>
                </span>
                {!compact && (
                  <span className="w-12 text-right font-mono text-sm tabular-nums text-muted">
                    {formatDuration(elapsed)}
                  </span>
                )}
              </div>
              {!compact && p.path && p.path.length > 1 && (
                <p className="pl-9 text-xs leading-relaxed text-muted">{p.path.join(" → ")}</p>
              )}
            </li>
          );
        })}
      </ol>
      {!revealed && !compact && (
        <p className="text-xs text-muted">Everyone&apos;s routes show up here once you finish or give up.</p>
      )}
    </div>
  );
}
