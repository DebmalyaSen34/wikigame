"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, getSavedName, saveName, useBrowserValue } from "@/lib/client";
import { DIFFICULTIES, type Difficulty } from "@/lib/game";

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
  const [error, setError] = useState<string | null>(null);

  async function roll(which: "start" | "end") {
    const other = which === "start" ? end : start;
    const qs = new URLSearchParams({ mode: difficulty === "hard" ? "any" : "popular" });
    if (other) qs.append("exclude", other);
    try {
      const { title } = await api<{ title: string }>(`/api/random?${qs}`);
      (which === "start" ? setStart : setEnd)(title);
    } catch (e) {
      setError((e as Error).message);
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
    if (c) router.push(`/r/${c}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 py-12 sm:py-20">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-5xl font-semibold tracking-tight">WikiRace</h1>
        <p className="text-lg text-muted">
          Pick two Wikipedia pages. Get from one to the other using only the links in the articles. Fewest clicks wins,
          and time breaks ties.
        </p>
      </header>

      <form onSubmit={create} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
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
          <TitleInput value={start} onChange={setStart} onRoll={() => roll("start")} />
        </Field>
        <Field label="To">
          <TitleInput value={end} onChange={setEnd} onRoll={() => roll("end")} />
        </Field>
        <p className="text-xs text-muted">
          Leave both empty and we&apos;ll pick two pages that match the difficulty. If you choose pages yourself, the
          difficulty only sets the rules.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={busy} className="btn-primary">
          {busy ? (start || end ? "Creating…" : "Finding two fitting pages…") : "Create game"}
        </button>
      </form>

      <form onSubmit={join} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Join a friend&apos;s game</h2>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Room code"
            className="input flex-1 font-mono uppercase"
            maxLength={8}
          />
          <button className="btn-secondary">Join</button>
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

function TitleInput({ value, onChange, onRoll }: { value: string; onChange: (v: string) => void; onRoll: () => void }) {
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Random"
        className="input flex-1"
      />
      <button type="button" onClick={onRoll} className="btn-secondary" title="Pick a random page" aria-label="Pick a random page">
        🎲
      </button>
    </div>
  );
}
