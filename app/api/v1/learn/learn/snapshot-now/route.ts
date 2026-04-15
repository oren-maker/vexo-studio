import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { snapshotInsights } from "@/lib/learn/insights-snapshots";
import { runAutoImprovement } from "@/lib/learn/auto-improve";
import { createJob, finishJob, failJob, updateJob } from "@/lib/learn/sync-jobs";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const jobId = await createJob("insights-snapshot", 2, "יוצר snapshot חדש…");

    waitUntil(
      (async () => {
        try {
          await updateJob(jobId, { currentStep: "מחשב CorpusInsights", completedItems: 0 });
          const snap = await snapshotInsights();
          await updateJob(jobId, { currentStep: "מריץ Auto-Improve", completedItems: 1, currentMessage: snap.summary });
          let improvement: any = null;
          try {
            improvement = await runAutoImprovement(snap.snapshotId, 3);
          } catch (e: any) {
            improvement = { error: String(e.message || e).slice(0, 300) };
          }
          await finishJob(jobId, { snapshot: snap, improvement });
        } catch (e: any) {
          await failJob(jobId, String(e.message || e));
        }
      })(),
    );

    return NextResponse.json({ ok: true, jobId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
