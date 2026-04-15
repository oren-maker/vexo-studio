import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { lumaRay2Transition } from "@/lib/learn/fal-luma";
import { logEdit } from "@/lib/learn/merge-edit-log";

export const runtime = "nodejs";
export const maxDuration = 300;

// Body: { jobId, beforeClipId, afterClipId, startFrameUrl, endFrameUrl, type, durationSec? }
export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const { jobId, beforeClipId, afterClipId, startFrameUrl, endFrameUrl, type, durationSec } = body || {};
    if (!jobId || !beforeClipId || !afterClipId || !startFrameUrl || !endFrameUrl) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }
    if (!process.env.FAL_API_KEY) {
      return NextResponse.json({ error: "FAL_API_KEY חסר ב-Vercel env vars" }, { status: 500 });
    }

    const transition = await prisma.mergeTransition.create({
      data: {
        jobId,
        beforeClipId,
        afterClipId,
        type: type || "luma-ray2",
        startFrameUrl,
        endFrameUrl,
        durationSec: durationSec || 5,
        status: "rendering",
      },
    });

    waitUntil(
      (async () => {
        try {
          const r = await lumaRay2Transition({
            startFrameUrl,
            endFrameUrl,
            durationSec: (durationSec || 5) as 5 | 9,
          });
          await prisma.mergeTransition.update({
            where: { id: transition.id },
            data: {
              status: "complete",
              outputUrl: r.videoUrl,
              externalId: r.requestId,
              costUsd: r.usdCost,
              completedAt: new Date(),
            },
          });
          await logEdit(jobId, "ai-transition-generated", { transitionId: transition.id, costUsd: r.usdCost, durationSec: r.durationSec });
        } catch (e: any) {
          await prisma.mergeTransition.update({
            where: { id: transition.id },
            data: { status: "failed", errorMsg: String(e?.message || e).slice(0, 1000), completedAt: new Date() },
          });
        }
      })(),
    );

    return NextResponse.json({ ok: true, transitionId: transition.id });
  } catch (e: any) {
    console.error("[transitions generate]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
