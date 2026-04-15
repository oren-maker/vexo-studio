import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { regenerateFromUrl } from "@/app/learn/sources/[id]/actions";
import { createJob, finishJob, failJob } from "@/lib/learn/sync-jobs";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const jobId = await createJob("regenerate-from-url", 4, "מאתחל…");

  waitUntil(
    (async () => {
      try {
        const r = await regenerateFromUrl(params.id, jobId);
        if (r.ok) await finishJob(jobId, r);
        else await failJob(jobId, r.error || "unknown error");
      } catch (e: any) {
        await failJob(jobId, String(e?.message || e).slice(0, 500));
      }
    })(),
  );

  return NextResponse.json({ ok: true, jobId });
}
