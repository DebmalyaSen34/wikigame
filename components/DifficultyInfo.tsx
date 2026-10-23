import { DIFFICULTIES, parText, type Room } from "@/lib/game";

const TONE = {
  easy: "border-success/50 bg-success/10 text-success",
  normal: "border-accent/50 bg-accent/10 text-accent",
  hard: "border-danger/50 bg-danger/10 text-danger",
} as const;

export function DifficultyBadge({ room }: { room: Room }) {
  const d = room.difficulty ?? "normal";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${TONE[d]}`}>
      {DIFFICULTIES[d].label}
    </span>
  );
}

// Rules for this room, plus what we proved about the shortest route. The middle
// page of a 2-click route is a spoiler, so it's only shown when `revealRoute`.
export function DifficultyInfo({ room, revealRoute }: { room: Room; revealRoute: boolean }) {
  const d = DIFFICULTIES[room.difficulty ?? "normal"];
  const par = parText(room.par);
  const via = room.par && "via" in room.par ? room.par.via : undefined;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm">
      <div className="flex items-center gap-2">
        <DifficultyBadge room={room} />
        <span className="text-muted">{d.pages}</span>
      </div>
      <ul className="list-disc pl-5 text-muted">
        {d.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
        {par && (
          <li>
            {par}
            {revealRoute && via && (
              <>
                {" "}
                (e.g. {room.start} → {via} → {room.end})
              </>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
