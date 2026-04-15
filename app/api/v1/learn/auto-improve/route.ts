import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runAutoImprovement } from "@/lib/learn/auto-improve";
import { createJob, finishJob, failJob } from "@/lib/learn/sync-jobs";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { snapshotId, max } = await req.json();
    if (!snapshotId) return NextResponse.json({ ok: false, error: "snapshotId נדרש" }, { status: 400 });

    const jobId = await createJob("auto-improve", max || 5, "מאתחל…");

    waitUntil(
      (async () => {
        try {
          const r = await runAutoImprovement(snapshotId, max || 5, jobId);
          await finishJob(jobId, r);
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
