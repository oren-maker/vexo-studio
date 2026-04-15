import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { extractAllDeterministic } from "@/lib/learn/text-knowledge-extractor";
import { createJob, finishJob, failJob } from "@/lib/learn/sync-jobs";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const jobId = await createJob("pattern-extract", 0, "מתחיל…");
  waitUntil(
    (async () => {
      try {
        const result = await extractAllDeterministic(jobId);
        await finishJob(jobId, result);
      } catch (e: any) {
        await failJob(jobId, String(e.message || e));
      }
    })(),
  );
  return NextResponse.json({ ok: true, jobId });
}
