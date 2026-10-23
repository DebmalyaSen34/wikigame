"use client";

import { useMemo, useState } from "react";
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

type Point = { along: number; across: number }; // along = direction of travel, across = within a column
type LaidNode = { title: string; layer: number; cx: number; cy: number; visitors: string[] };
type LaidEdge = {
  from: string;
  to: string;
  players: string[];
  waypoints: Point[]; // an empty slot reserved in every column the edge passes through
};

const SIZES = {
  horizontal: { nodeW: 140, nodeH: 34, layerGap: 176, crossGap: 54, pad: 20 },
  // Two pages side by side fit the 300px game sidebar without scrolling.
  vertical: { nodeW: 122, nodeH: 32, layerGap: 72, crossGap: 136, pad: 12 },
};

// Half a node's size along the direction of travel, and across it.
function halves(orientation: Orientation) {
  const S = SIZES[orientation];
  return orientation === "horizontal"
    ? { hA: S.nodeW / 2, hC: S.nodeH / 2 }
    : { hA: S.nodeH / 2, hC: S.nodeW / 2 };
}

// Layered layout (the usual approach for flow graphs): pages go in columns by
// click distance from the start, and every line only travels through the gaps
// between columns. A line that skips columns gets an empty slot reserved in
// each column it crosses, so no line ever runs over a page.
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
      const edge = edges.get(key) ?? { from, to, players: [], waypoints: [] };
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

  // Column = fewest clicks from the start over anyone's route.
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
  // The target always sits alone in the last column, so every finished route converges on it.
  layer.set(end, maxLayer + 1);

  const layers: string[][] = Array.from({ length: maxLayer + 2 }, () => []);
  for (const t of seen) layers[layer.get(t)!].push(t);

  // Reserve slots for lines that skip columns, and remember which items
  // connect between neighbouring columns (used to order each column).
  const chains = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const link = (u: string, v: string, lu: number, lv: number) => {
    const [lo, hi] = lu < lv ? [u, v] : [v, u];
    if (Math.abs(lu - lv) === 1) parents.set(hi, [...(parents.get(hi) ?? []), lo]);
  };
  const layerOf = (id: string) => layer.get(id)!;
  for (const [key, e] of edges) {
    const la = layerOf(e.from);
    const lb = layerOf(e.to);
    const step = lb > la ? 1 : -1;
    const chain = [e.from];
    for (let l = la + step; step * (lb - l) > 0; l += step) {
      const id = `\u0001${key}\u0001${l}`;
      layers[l].push(id);
      layer.set(id, l);
      chain.push(id);
    }
    chain.push(e.to);
    chains.set(key, chain);
    for (let i = 1; i < chain.length; i++) link(chain[i - 1], chain[i], layerOf(chain[i - 1]), layerOf(chain[i]));
  }

  // Order each column by the average position of what feeds into it, to untangle lines.
  const position = new Map<string, number>();
  layers[0].forEach((t, i) => position.set(t, i));
  for (let l = 1; l < layers.length; l++) {
    const score = (t: string, i: number) => {
      const ps = parents.get(t);
      return ps?.length ? ps.reduce((sum, p) => sum + (position.get(p) ?? 0), 0) / ps.length : i;
    };
    layers[l] = layers[l]
      .map((t, i) => ({ t, s: score(t, i) }))
      .sort((x, y) => x.s - y.s)
      .map((x) => x.t);
    layers[l].forEach((t, i) => position.set(t, i));
  }

  const S = SIZES[orientation];
  const { hA, hC } = halves(orientation);
  const widest = Math.max(...layers.map((l) => l.length));
  const points = new Map<string, Point>();
  layers.forEach((ids, l) => {
    ids.forEach((id, i) => {
      points.set(id, {
        along: S.pad + l * S.layerGap + hA,
        across: S.pad + (i + (widest - ids.length) / 2) * S.crossGap + hC,
      });
    });
  });

  const nodes = new Map<string, LaidNode>();
  for (const title of seen) {
    const pt = points.get(title)!;
    nodes.set(title, {
      title,
      layer: layer.get(title)!,
      cx: orientation === "horizontal" ? pt.along : pt.across,
      cy: orientation === "horizontal" ? pt.across : pt.along,
      visitors: visitors.get(title)!,
    });
  }
  for (const [key, e] of edges) e.waypoints = chains.get(key)!.slice(1, -1).map((id) => points.get(id)!);

  const alongSize = S.pad * 2 + (layers.length - 1) * S.layerGap + hA * 2;
  const acrossSize = S.pad * 2 + (widest - 1) * S.crossGap + hC * 2;
  return {
    nodes,
    edges: [...edges.values()],
    width: orientation === "horizontal" ? alongSize : acrossSize,
    height: orientation === "horizontal" ? acrossSize : alongSize,
  };
}

// Every line stops in a gap before the page it enters: the coloured lines end
// ARROW_GAP away, and one small neutral chevron sits in that gap with its tip
// TIP_GAP from the pill, so nothing ever touches a pill's border.
const TIP_GAP = 3;
const ARROW_LEN = 7;
const ARROW_GAP = TIP_GAP + ARROW_LEN + 2;
const START_GAP = 3;

// `off` spreads the parallel lines of different players apart.
function edgeShape(e: LaidEdge, nodes: Map<string, LaidNode>, off: number, orientation: Orientation) {
  const S = SIZES[orientation];
  const { hA, hC } = halves(orientation);
  const horizontal = orientation === "horizontal";
  const a = nodes.get(e.from)!;
  const b = nodes.get(e.to)!;
  const along = (n: LaidNode) => (horizontal ? n.cx : n.cy);
  const across = (n: LaidNode) => (horizontal ? n.cy : n.cx);
  const xy = (p: Point) => (horizontal ? `${p.along} ${p.across}` : `${p.across} ${p.along}`);
  // Lines going back to an earlier (or the same) column enter the page from its
  // far side, a little off-centre so they don't meet the lines leaving it.
  const backEntry = hC * 0.45;
  const forward = b.layer > a.layer;
  const dir = forward ? 1 : -1;

  let d: string;
  let tip: Point;
  if (b.layer === a.layer) {
    // Same column: loop out into the gap after the column and back in.
    const channel = along(a) + S.layerGap / 2;
    const p0 = { along: along(a) + hA + START_GAP, across: across(a) + off };
    const p3 = { along: along(b) + hA + ARROW_GAP, across: across(b) + backEntry + off };
    d = `M ${xy(p0)} C ${xy({ along: channel, across: p0.across })}, ${xy({ along: channel, across: p3.across })}, ${xy(p3)}`;
    tip = { along: along(b) + hA + TIP_GAP, across: across(b) + backEntry };
  } else {
    const entry = forward ? 0 : backEntry;
    const pts: Point[] = [
      { along: along(a) + dir * (hA + START_GAP), across: across(a) + off },
      ...e.waypoints.map((w) => ({ along: w.along, across: w.across + off })),
      { along: along(b) - dir * (hA + ARROW_GAP), across: across(b) + entry + off },
    ];
    d = `M ${xy(pts[0])}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      const h = (q.along - p.along) / 2; // handles along the flow: each hop stays inside its gap
      d += ` C ${xy({ along: p.along + h, across: p.across })}, ${xy({ along: q.along - h, across: q.across })}, ${xy(q)}`;
    }
    tip = { along: along(b) - dir * (hA + TIP_GAP), across: across(b) + entry };
  }
  const angle = horizontal ? (forward ? 0 : 180) : forward ? 90 : -90;
  const [x, y] = horizontal ? [tip.along, tip.across] : [tip.across, tip.along];
  return { d, tip: { x, y, angle } };
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
          <g>
            {layout.edges.flatMap((e) => {
              const ordered = [...e.players].sort((x, y) => colors.get(x)! - colors.get(y)!);
              const lines = drawOrder(ordered).map((pid) => {
                const k = ordered.indexOf(pid);
                const off = (k - (ordered.length - 1) / 2) * 4;
                const dim = focus !== null && focus !== pid;
                return (
                  <path
                    key={`${e.from}-${e.to}-${pid}`}
                    d={edgeShape(e, layout.nodes, off, orientation).d}
                    fill="none"
                    stroke={PALETTE[colors.get(pid)!]}
                    strokeWidth={pid === meId || pid === focus ? 2.5 : 2}
                    strokeLinecap="round"
                    opacity={dim ? 0.12 : 0.9}
                    className="transition-opacity"
                  />
                );
              });
              // One small neutral chevron per connection, however many players took it.
              const { tip } = edgeShape(e, layout.nodes, 0, orientation);
              const arrowDim = focus !== null && !e.players.includes(focus);
              return [
                ...lines,
                <path
                  key={`${e.from}-${e.to}-arrow`}
                  d={`M ${-ARROW_LEN} -4 L 0 0 L ${-ARROW_LEN} 4`}
                  transform={`translate(${tip.x} ${tip.y}) rotate(${tip.angle})`}
                  fill="none"
                  className="stroke-muted transition-opacity"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={arrowDim ? 0.2 : 1}
                />,
              ];
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
