"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, getSavedName, saveName, useBrowserValue } from "@/lib/client";
import { DIFFICULTIES, type Difficulty } from "@/lib/game";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  const router = useRouter();
  const savedName = useBrowserValue(getSavedName, "");
  const [editedName, setName] = useState<string | null>(null);
  const name = editedName ?? savedName;
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState<"start" | "end" | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function roll(which: "start" | "end") {
    const other = which === "start" ? end : start;
    const qs = new URLSearchParams({ mode: difficulty === "hard" ? "any" : "popular" });
    if (other) qs.append("exclude", other);
    setRolling(which);
    try {
      const { title } = await api<{ title: string }>(`/api/random?${qs}`);
      (which === "start" ? setStart : setEnd)(title);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRolling(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    saveName(name.trim());
    try {
      const { id } = await api<{ id: string }>("/api/rooms", { json: { name, difficulty, start, end } });
      router.push(`/r/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setJoining(true);
    router.push(`/r/${c}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:gap-8 sm:py-20">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">WikiRace</h1>
          <ThemeToggle />
        </div>
        <p className="text-base text-muted sm:text-lg">
          Pick two Wikipedia pages. Get from one to the other using only the links in the articles. Fewest clicks wins,
          and time breaks ties.
        </p>
      </header>

      <form onSubmit={create} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Start a new game</h2>
        <Field label="Your name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Deb"
            className="input"
          />
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Difficulty</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={difficulty === d}
                onClick={() => setDifficulty(d)}
                className={`h-10 rounded-lg border text-sm font-medium transition-colors ${
                  difficulty === d ? "border-accent bg-accent text-accent-ink" : "border-border hover:bg-border/40"
                }`}
              >
                {DIFFICULTIES[d].label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">
            {DIFFICULTIES[difficulty].pages}. {DIFFICULTIES[difficulty].rules.join(". ")}.
          </p>
        </fieldset>
        <Field label="From">
          <TitleInput value={start} onChange={setStart} onRoll={() => roll("start")} rolling={rolling === "start"} />
        </Field>
        <Field label="To">
          <TitleInput value={end} onChange={setEnd} onRoll={() => roll("end")} rolling={rolling === "end"} />
        </Field>
        <p className="text-xs text-muted">
          Leave both empty and we&apos;ll pick two pages that match the difficulty. If you choose pages yourself, the
          difficulty only sets the rules.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={busy || rolling !== null} className="btn-primary gap-2">
          {busy && <Spinner />}
          {busy ? (start || end ? "Creating game…" : "Finding two fitting pages…") : "Create game"}
        </button>
      </form>

      <form onSubmit={join} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Join a friend&apos;s game</h2>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Room code"
            className="input min-w-0 flex-1 font-mono uppercase"
            maxLength={8}
          />
          <button disabled={joining} className="btn-secondary w-24 gap-2">
            {joining ? <Spinner /> : "Join"}
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function TitleInput({
  value,
  onChange,
  onRoll,
  rolling,
}: {
  value: string;
  onChange: (v: string) => void;
  onRoll: () => void;
  rolling: boolean;
}) {
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={rolling ? "Picking a random page…" : "Random"}
        disabled={rolling}
        className="input min-w-0 flex-1 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={onRoll}
        disabled={rolling}
        className="btn-secondary w-12 px-0"
        title="Pick a random page"
        aria-label="Pick a random page"
      >
        {rolling ? <Spinner /> : "🎲"}
      </button>
    </div>
  );
}
