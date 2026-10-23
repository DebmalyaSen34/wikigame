import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/api";
import { BANK_TARGET, refillBank } from "@/lib/bank";
import type { Difficulty } from "@/lib/game";

// Long enough to add dozens of pairs at Wikipedia's rate limit.
export const maxDuration = 300;
const BUDGET_MS = 270_000;

// GET /api/cron/refill-bank — run daily by Vercel Cron (see vercel.json).
// Tops up the pair bank for every difficulty, round-robin, within the time
// budget. Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET
// is set; without a secret it only runs outside Vercel (local dev).
export const GET = withErrors(async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret ? req.headers.get("authorization") === `Bearer ${secret}` : !process.env.VERCEL;
  if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const deadline = Date.now() + BUDGET_MS;
  const difficulties = Object.keys(BANK_TARGET) as Difficulty[];
  const result: Record<string, { added: number; size: number }> = {};
  // A few pairs per difficulty per pass, so all of them make progress.
  for (let pass = 0; Date.now() < deadline; pass++) {
    let progressed = false;
    for (const d of difficulties) {
      const r = await refillBank(d, deadline, 5);
      result[d] = { added: (result[d]?.added ?? 0) + r.added, size: r.size };
      if (r.added) progressed = true;
    }
    if (!progressed) break; // all full (or Wikipedia unavailable)
  }
  return Response.json({ ok: true, banks: result, targets: BANK_TARGET });
});
