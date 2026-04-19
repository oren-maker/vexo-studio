import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { startVideoGeneration, runVideoGeneration } from "@/lib/learn/gemini-video-gen";

export const runtime = "nodejs";
export const maxDuration = 60;

// Retry a failed GeneratedVideo — kicks off a fresh generation from the same
// LearnSource, same model/duration/aspect. The old row is left in "failed"
// so history is preserved; a new row is created for the retry attempt.
export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { videoId } = await req.json();
    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

    const orig = await prisma.generatedVideo.findUnique({ where: { id: videoId } });
    if (!orig) return NextResponse.json({ error: "not found" }, { status: 404 });

    const source = await prisma.learnSource.findUnique({ where: { id: orig.sourceId } });
    if (!source?.prompt) return NextResponse.json({ error: "source has no prompt" }, { status: 400 });

    const ar: "16:9" | "9:16" = orig.aspectRatio === "9:16" ? "9:16" : "16:9";
    const newId = await startVideoGeneration(source.prompt, source.id, {
      durationSec: orig.durationSec,
      aspectRatio: ar,
    });
    waitUntil(runVideoGeneration(newId, source.prompt).catch(() => {}));

    return NextResponse.json({ ok: true, originalId: videoId, retryId: newId });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
