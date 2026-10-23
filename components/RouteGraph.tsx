"use client";

import { useId, useMemo, useState } from "react";
import type { PlayerStatus } from "@/lib/game";

// Draws every player's route as one merged graph: each page appears once, and
// each player's clicks are a coloured line. Shared stretches run side by side,
// splits branch apart, and every route converges on the single target node.

export type GraphPlayer = {
  id: string;
  name: string;
  startedAt: number;
  status: PlayerStatus;
  clicks: number;
  path: string[];
  backAt?: number[];
};

// Readable on both light and dark backgrounds.
const PALETTE = ["#4f7cff", "#f0574a", "#18a874", "#f2a516", "#a463f2", "#e8559b", "#13a8c2", "#8bab1c"];

// Colours follow join order, so "the red route" means the same person on every screen.
export function playerColorMap(players: { id: string; startedAt: number }[]) {
  const sorted = [...players].sort((a, b) => a.startedAt - b.startedAt);
  return new Map(sorted.map((p, i) => [p.id, i % PALETTE.length]));
}

type Orientation = "horizontal" | "vertical";

type LaidNode = { title: string; layer: number; index: number; cx: number; cy: number; visitors: string[] };
type LaidEdge = { from: string; to: string; players: string[] };

const SIZES = {
  horizontal: { nodeW: 140, nodeH: 34, layerGap: 170, crossGap: 58, pad: 20 },
  vertical: { nodeW: 132, nodeH: 32, layerGap: 66, crossGap: 146, pad: 16 },
};

function buildLayout(players: GraphPlayer[], start: string, end: string, orientation: Orientation) {
  const edges = new Map<string, LaidEdge>();
  const adj = new Map<string, Set<string>>();
  const visitors = new Map<string, string[]>();
  const seen: string[] = [];

  const visit = (title: string, playerId: string) => {
    if (!visitors.has(title)) {
      visitors.set(title, []);
      seen.push(title);
    }
    const v = visitors.get(title)!;
    if (!v.includes(playerId)) v.push(playerId);
  };

  visitors.set(start, []);
  seen.push(start);
  for (const p of players) {
    const backs = new Set(p.backAt ?? []);
    visit(p.path[0], p.id);
    for (let i = 1; i < p.path.length; i++) {
      const from = p.path[i - 1];
      const to = p.path[i];
      visit(to, p.id);
      if (backs.has(i)) continue; // Back moves retrace an existing line, so they aren't drawn
      const key = `${from}\u0000${to}`;
      const edge = edges.get(key) ?? { from, to, players: [] };
      if (!edge.players.includes(p.id)) edge.players.push(p.id);
      edges.set(key, edge);
      if (!adj.has(from)) adj.set(from, new Set());
      adj.get(from)!.add(to);
    }
  }
  if (!visitors.has(end)) {
    visitors.set(end, []);
    seen.push(end);
  }

  // Layer = fewest clicks from the start over anyone's route.
  const layer = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (!layer.has(next)) {
        layer.set(next, layer.get(cur)! + 1);
        queue.push(next);
      }
    }
  }
  let maxLayer = 0;
  for (const t of seen) {
    if (t === end) continue;
    if (!layer.has(t)) layer.set(t, 1);
    maxLayer = Math.max(maxLayer, layer.get(t)!);
  }
  // The target always sits alone at the far end, so every finished route converges on it.
  layer.set(end, maxLayer + 1);

  const layers: string[][] = Array.from({ length: maxLayer + 2 }, () => []);
  for (const t of seen) layers[layer.get(t)!].push(t);

  // Order each layer by the average position of its parents, to untangle lines.
  const position = new Map<string, number>();
  layers[0].forEach((t, i) => position.set(t, i));
  const parents = new Map<string, string[]>();
  for (const e of edges.values()) {
    if (layer.get(e.from)! < layer.get(e.to)!) parents.set(e.to, [...(parents.get(e.to) ?? []), e.from]);
  }
  for (let l = 1; l < layers.length; l++) {
    const score = (t: string, i: number) => {
      const ps = parents.get(t);
      return ps?.length ? ps.reduce((s, p) => s + (position.get(p) ?? 0), 0) / ps.length : i;
    };
    const scored = layers[l].map((t, i) => ({ t, s: score(t, i) }));
    scored.sort((a, b) => a.s - b.s);
    layers[l] = scored.map((x) => x.t);
    layers[l].forEach((t, i) => position.set(t, i));
  }

  const S = SIZES[orientation];
  const widest = Math.max(...layers.map((l) => l.length));
  const nodes = new Map<string, LaidNode>();
  layers.forEach((titles, l) => {
    titles.forEach((title, i) => {
      const along = S.pad + l * S.layerGap + (orientation === "horizontal" ? S.nodeW / 2 : S.nodeH / 2);
      const across =
        S.pad +
        (i + (widest - titles.length) / 2) * S.crossGap +
        (orientation === "horizontal" ? S.nodeH / 2 : S.nodeW / 2);
      nodes.set(title, {
        title,
        layer: l,
        index: i,
        cx: orientation === "horizontal" ? along : across,
        cy: orientation === "horizontal" ? across : along,
        visitors: visitors.get(title)!,
      });
    });
  });

  const alongSize = S.pad * 2 + (layers.length - 1) * S.layerGap + (orientation === "horizontal" ? S.nodeW : S.nodeH);
  const acrossSize = S.pad * 2 + (widest - 1) * S.crossGap + (orientation === "horizontal" ? S.nodeH : S.nodeW);
  // Extra room for lines that loop back to an earlier page.
  const loopRoom = [...edges.values()].some((e) => layer.get(e.to)! <= layer.get(e.from)!) ? 50 : 0;

  return {
    nodes,
    edges: [...edges.values()],
    width: orientation === "horizontal" ? alongSize : acrossSize + loopRoom,
    height: orientation === "horizontal" ? acrossSize + loopRoom : alongSize,
    offsetY: orientation === "horizontal" ? loopRoom : 0,
  };
}

function edgePath(a: LaidNode, b: LaidNode, off: number, orientation: Orientation) {
  const S = SIZES[orientation];
  if (orientation === "horizontal") {
    if (b.layer > a.layer) {
      const x1 = a.cx + S.nodeW / 2, y1 = a.cy + off;
      const x2 = b.cx - S.nodeW / 2 - 6, y2 = b.cy + off;
      const h = Math.max(40, (x2 - x1) / 2);
      return `M ${x1} ${y1} C ${x1 + h} ${y1}, ${x2 - h} ${y2}, ${x2} ${y2}`;
    }
    // Clicking a link back to an earlier page: arc over the top.
    const x1 = a.cx + off, y1 = a.cy - S.nodeH / 2;
    const x2 = b.cx + off, y2 = b.cy - S.nodeH / 2 - 6;
    const lift = 40 + Math.abs(x1 - x2) * 0.08;
    return `M ${x1} ${y1} C ${x1} ${y1 - lift}, ${x2} ${y2 - lift}, ${x2} ${y2}`;
  }
  if (b.layer > a.layer) {
    const x1 = a.cx + off, y1 = a.cy + S.nodeH / 2;
    const x2 = b.cx + off, y2 = b.cy - S.nodeH / 2 - 6;
    const h = Math.max(20, (y2 - y1) / 2);
    return `M ${x1} ${y1} C ${x1} ${y1 + h}, ${x2} ${y2 - h}, ${x2} ${y2}`;
  }
  const x1 = a.cx + S.nodeW / 2, y1 = a.cy + off;
  const x2 = b.cx + S.nodeW / 2 + 6, y2 = b.cy + off;
  const out = 30 + Math.abs(y1 - y2) * 0.1;
  return `M ${x1} ${y1} C ${x1 + out} ${y1}, ${x2 + out} ${y2}, ${x2} ${y2}`;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// The pages a player is "really" on after undoing Back moves.
function effectiveRoute(p: GraphPlayer) {
  const backs = new Set(p.backAt ?? []);
  const stack: string[] = [];
  p.path.forEach((t, i) => (backs.has(i) ? stack.pop() : stack.push(t)));
  return stack;
}

function compare(me: GraphPlayer, other: GraphPlayer): string {
  const a = effectiveRoute(me);
  const b = effectiveRoute(other);
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  if (shared === a.length && shared === b.length) return "Exact same route as you";
  if (shared === b.length) {
    return b.length === 1 ? "Currently back at the start page" : `On your route so far, currently at ${b.at(-1)}`;
  }
  const splitAfter = a[shared - 1];
  const aRest = new Set(a.slice(shared));
  const rejoin = b.slice(shared).find((t) => aRest.has(t));
  let text = shared <= 1 ? "Different from the first click" : `Same as you until ${splitAfter}, then split`;
  if (rejoin) text += ` · met you again at ${rejoin}`;
  return text;
}

export function RouteGraph({
  players,
  start,
  end,
  meId,
  orientation = "horizontal",
}: {
  players: GraphPlayer[];
  start: string;
  end: string;
  meId?: string;
  orientation?: Orientation;
}) {
  const uid = useId().replace(/:/g, "");
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const focus = hovered ?? pinned;

  const colors = useMemo(() => playerColorMap(players), [players]);
  const layout = useMemo(() => buildLayout(players, start, end, orientation), [players, start, end, orientation]);
  const S = SIZES[orientation];
  const multi = players.length > 1;
  const me = players.find((p) => p.id === meId);
  const endReached = layout.nodes.get(end)!.visitors.length > 0;

  // Draw the focused player (and you) on top.
  const drawOrder = (ids: string[]) =>
    [...ids].sort((a, b) => Number(a === focus || a === meId) - Number(b === focus || b === meId));

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <svg width={layout.width} height={layout.height} className="mx-auto block" role="img" aria-label="Route map">
          <defs>
            {PALETTE.map((c, i) => (
              <marker
                key={c}
                id={`${uid}-arrow-${i}`}
                viewBox="0 0 10 10"
                refX="1"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
              </marker>
            ))}
          </defs>
          <g transform={`translate(0 ${layout.offsetY})`}>
            {layout.edges.flatMap((e) => {
              const a = layout.nodes.get(e.from)!;
              const b = layout.nodes.get(e.to)!;
              const ordered = [...e.players].sort((x, y) => colors.get(x)! - colors.get(y)!);
              return drawOrder(ordered).map((pid) => {
                const k = ordered.indexOf(pid);
                const off = (k - (ordered.length - 1) / 2) * 4.5;
                const ci = colors.get(pid)!;
                const dim = focus !== null && focus !== pid;
                return (
                  <path
                    key={`${e.from}-${e.to}-${pid}`}
                    d={edgePath(a, b, off, orientation)}
                    fill="none"
                    stroke={PALETTE[ci]}
                    strokeWidth={pid === meId || pid === focus ? 3 : 2}
                    strokeLinecap="round"
                    opacity={dim ? 0.12 : 0.9}
                    markerEnd={`url(#${uid}-arrow-${ci})`}
                    className="transition-opacity"
                  />
                );
              });
            })}

            {[...layout.nodes.values()].map((n) => {
              const isStart = n.title === start;
              const isEnd = n.title === end;
              const dim = focus !== null && !n.visitors.includes(focus) && !isStart && !isEnd;
              return (
                <g key={n.title} opacity={dim ? 0.35 : 1} className="transition-opacity">
                  <title>{n.title}</title>
                  <rect
                    x={n.cx - S.nodeW / 2}
                    y={n.cy - S.nodeH / 2}
                    width={S.nodeW}
                    height={S.nodeH}
                    rx={S.nodeH / 2}
                    className={isEnd ? "fill-target/30 stroke-target" : isStart ? "fill-surface stroke-foreground" : "fill-background stroke-border"}
                    strokeWidth={isStart || isEnd ? 2 : 1}
                    strokeDasharray={isEnd && !endReached ? "5 4" : undefined}
                  />
                  <text
                    x={n.cx}
                    y={n.cy + (multi && n.visitors.length ? -2 : 4)}
                    textAnchor="middle"
                    className="fill-foreground text-[12px]"
                    fontWeight={isStart || isEnd ? 600 : 400}
                  >
                    {truncate(n.title, orientation === "horizontal" ? 20 : 18)}
                  </text>
                  {multi &&
                    n.visitors.map((pid, i) => (
                      <circle
                        key={pid}
                        cx={n.cx + (i - (n.visitors.length - 1) / 2) * 8}
                        cy={n.cy + 10}
                        r={2.5}
                        fill={PALETTE[colors.get(pid)!]}
                      />
                    ))}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {multi && (
        <ul className="flex flex-col gap-1.5">
          {[...players]
            .sort((a, b) => Number(b.id === meId) - Number(a.id === meId) || colors.get(a.id)! - colors.get(b.id)!)
            .map((p) => (
              <li key={p.id}>
                <button
                  onMouseEnter={() => setHovered(p.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setPinned(pinned === p.id ? null : p.id)}
                  className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    pinned === p.id ? "border-foreground/40 bg-border/30" : "border-transparent hover:bg-border/30"
                  }`}
                >
                  <span className="mt-1.5 h-1 w-5 shrink-0 rounded-full" style={{ background: PALETTE[colors.get(p.id)!] }} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.name}</span>
                    {p.id === meId && <span className="text-muted"> (you)</span>}
                    <span className="text-muted">
                      {" "}
                      · {p.clicks} click{p.clicks === 1 ? "" : "s"}
                      {p.status === "finished" ? " · finished" : p.status === "gaveup" ? " · gave up" : " · still playing"}
                    </span>
                    {me && p.id !== meId && <span className="block text-xs text-muted">{compare(me, p)}</span>}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
      {multi && <p className="text-xs text-muted">Hover a name to trace their route, click to pin it.</p>}
    </div>
  );
}
