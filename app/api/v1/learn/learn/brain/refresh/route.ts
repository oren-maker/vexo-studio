import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { computeDailyBrainCache } from "@/lib/learn/brain";
import { requireAdmin } from "@/lib/learn/auth";
import { createJob, finishJob, failJob, updateJob } from "@/lib/learn/sync-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

// Force-refresh today's brain cache (overwrites if exists). Useful for manual trigger.
export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const jobId = await createJob("daily-brain-refresh", 1, "Gemini Pro מחבר זהות יומית…");

  waitUntil(
    (async () => {
      try {
        await updateJob(jobId, { currentStep: "אוסף נתונים מהמאגר", currentMessage: "" });
        const r = await computeDailyBrainCache(new Date());
        await finishJob(jobId, { date: r.cache.date, identity: r.cache.identity });
      } catch (e: any) {
        await failJob(jobId, String(e?.message || e).slice(0, 500));
      }
    })(),
  );

  return NextResponse.json({ ok: true, jobId });
}
