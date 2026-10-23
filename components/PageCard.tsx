import type { PageInfo } from "@/lib/game";

export function PageCard({ label, info, highlight }: { label: string; info: PageInfo; highlight?: boolean }) {
  return (
    <div
      className={`flex min-w-0 flex-1 gap-3 rounded-xl border bg-surface p-3 ${
        highlight ? "border-target" : "border-border"
      }`}
    >
      {info.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded-lg bg-border/60" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate font-serif text-xl font-semibold">{info.title}</p>
        {info.description && <p className="line-clamp-2 text-sm text-muted">{info.description}</p>}
      </div>
    </div>
  );
}
