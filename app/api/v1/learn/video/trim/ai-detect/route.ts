import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { understandVideo } from "@/lib/learn/gemini-video-understand";
import { createJob, finishJob, failJob, updateJob } from "@/lib/learn/sync-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

// Body: { inputBlobUrl, filename }
// Returns { jobId } immediately. Polling /api/learn/jobs/[id] gives progress.
// On completion the job result contains { sessionId } pointing to the new TrimSession.
export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { inputBlobUrl, filename } = await req.json();
    if (!inputBlobUrl) return NextResponse.json({ error: "inputBlobUrl required" }, { status: 400 });

    const jobId = await createJob("ai-scene-detect", 3, "מאתחל…");

    waitUntil(
      (async () => {
        try {
          const result = await understandVideo(inputBlobUrl, async (msg) => {
            await updateJob(jobId, { currentStep: msg, currentMessage: "" });
          });
          await updateJob(jobId, { currentStep: "שומר סצנות", completedItems: 2 });

          // Persist as TrimSession + TrimScenes (no thumbnails — Gemini already analyzed the video)
          const session = await prisma.trimSession.create({
            data: {
              inputBlobUrl,
              filename: filename || "video.mp4",
              durationSec: result.totalDuration,
              status: "ready",
              scenes: {
                create: result.scenes.map((s, i) => ({
                  startSec: s.startSec,
                  endSec: s.endSec,
                  thumbnailUrl: null,
                  aiRating: s.rating,
                  aiReason: `${s.description} — ${s.reason}`,
                  selected: s.suggestedKeep,
                  order: i,
                })),
              },
            },
            include: { scenes: { orderBy: { order: "asc" } } },
          });

          await finishJob(jobId, { sessionId: session.id, sceneCount: session.scenes.length, summary: result.summary });
        } catch (e: any) {
          await failJob(jobId, String(e?.message || e).slice(0, 1000));
        }
      })(),
    );

    return NextResponse.json({ ok: true, jobId });
  } catch (e: any) {
    console.error("[ai-detect]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
