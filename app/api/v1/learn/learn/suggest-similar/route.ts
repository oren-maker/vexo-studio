import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { suggestSimilar } from "@/lib/learn/gemini-compose";
import { createJob, finishJob, failJob, updateJob } from "@/lib/learn/sync-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

// Public — read-only generation that already runs on server. Each call costs ~$0.001.
// If abuse becomes a concern, gate with requireAdmin like other paid endpoints.
export async function POST(req: NextRequest) {
  try {
    const { sourceId, count = 3 } = await req.json();
    if (!sourceId) return NextResponse.json({ ok: false, error: "sourceId נדרש" }, { status: 400 });
    const total = Math.max(1, Math.min(5, Number(count) || 3));

    const jobId = await createJob("suggest-similar", total, "מאתחל…");

    waitUntil(
      (async () => {
        try {
          const items = await suggestSimilar(sourceId, total, async (i, t, elapsed) => {
            const avgMs = i > 0 ? elapsed / i : 0;
            const remainingMs = avgMs * (t - i);
            const eta = remainingMs > 0 ? `~${Math.ceil(remainingMs / 1000)}s נותרו` : "";
            await updateJob(jobId, {
              completedItems: i,
              totalItems: t,
              currentStep: i >= t ? "הושלם" : `מחולל וריאציה ${i + 1}/${t}`,
              currentMessage: i === 0 ? "טוען פרומפטים דומים מהמאגר…" : `${Math.round(elapsed / 1000)}s · ${eta}`,
            });
          });
          await finishJob(jobId, { items });
        } catch (e: any) {
          await failJob(jobId, String(e.message || e));
        }
      })(),
    );

    return NextResponse.json({ ok: true, jobId });
  } catch (e: any) {
    console.error("[suggest-similar]", e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
