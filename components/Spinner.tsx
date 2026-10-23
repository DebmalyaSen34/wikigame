export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

// Thin animated bar for "something is loading" at the top of a region.
export function ProgressBar({ active }: { active: boolean }) {
  return (
    <div className={`h-0.5 w-full overflow-hidden ${active ? "" : "invisible"}`} aria-hidden>
      <div className="wg-progress h-full w-1/3 rounded-full bg-accent" />
    </div>
  );
}

// Grey placeholder lines shown while an article loads for the first time.
export function ArticleSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-label="Loading article">
      <div className="mb-3 h-9 w-2/3 rounded-md bg-border/70" />
      {[100, 96, 92, 98, 70, 0, 100, 94, 88, 60].map((w, i) =>
        w ? <div key={i} className="h-4 rounded bg-border/60" style={{ width: `${w}%` }} /> : <div key={i} className="h-3" />,
      )}
    </div>
  );
}
