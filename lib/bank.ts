// Server-only: a bank of pre-verified start/target pairs per difficulty, kept
// in storage, so creating a room or round usually needs no Wikipedia requests
// at all and can't fail because Wikipedia is slow or rate-limiting us.
//
// It's topped up by a daily cron job (app/api/cron/refill-bank) and, between
// those, a little after any room is created while it's below target. Pairs
// expire after a week, so their "N clicks apart" claims stay fresh.

import type { Difficulty, PageInfo } from "./game";
import { generatePair, type Pair } from "./distance";
import { getPageInfo } from "./wiki";
import { store } from "./store";

export type BankedPair = Pair & { startInfo: PageInfo; endInfo: PageInfo; addedAt: number };

export const BANK_TARGET: Record<Difficulty, number> = { easy: 40, normal: 40, hard: 60 };
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const bankKey = (d: Difficulty) => `pair-bank:${d}`;

async function loadBank(difficulty: Difficulty): Promise<BankedPair[]> {
  const bank = (await store.getJson<BankedPair[]>(bankKey(difficulty))) ?? [];
  return bank.filter((p) => Date.now() - p.addedAt < MAX_AGE_MS);
}

export async function bankSize(difficulty: Difficulty): Promise<number> {
  return (await loadBank(difficulty)).length;
}

// A random banked pair that uses none of the `avoid` pages (pages this group
// already played), or null if there isn't one.
export async function takeFromBank(difficulty: Difficulty, avoid: string[]): Promise<BankedPair | null> {
  const used = new Set(avoid);
  const options = (await loadBank(difficulty)).filter((p) => !used.has(p.start) && !used.has(p.end));
  return options.length ? options[Math.floor(Math.random() * options.length)] : null;
}

// Adds pairs until the bank reaches its target, `maxNew` pairs have been
// added, or `deadline` passes. Saves after each pair, so progress survives a
// timeout. Only one refill per difficulty runs at a time.
export async function refillBank(
  difficulty: Difficulty,
  deadline: number,
  maxNew = Infinity,
): Promise<{ added: number; size: number }> {
  const lock = `bank-refill:${difficulty}`;
  if (!(await store.claim(lock, 300))) return { added: 0, size: await bankSize(difficulty) };
  try {
    const bank = await loadBank(difficulty); // drops expired pairs
    let added = 0;
    while (bank.length < BANK_TARGET[difficulty] && added < maxNew && Date.now() < deadline) {
      // Prefer pages not already in the bank, for variety.
      const generated = await generatePair(difficulty, bank.flatMap((p) => [p.start, p.end]));
      if (!generated) break;
      const { pair } = generated;
      if (bank.some((p) => p.start === pair.start && p.end === pair.end)) continue;
      const [startInfo, endInfo] = await Promise.all([getPageInfo(pair.start), getPageInfo(pair.end)]);
      bank.push({ ...pair, startInfo, endInfo, addedAt: Date.now() });
      added++;
      await store.setJson(bankKey(difficulty), bank);
    }
    if (added === 0) await store.setJson(bankKey(difficulty), bank); // still persist expiry clean-up
    return { added, size: bank.length };
  } finally {
    await store.release(lock);
  }
}
