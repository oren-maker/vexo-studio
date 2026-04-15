import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { logEdit } from "@/lib/learn/merge-edit-log";

export const runtime = "nodejs";

// Create a new MergeJob with N clips already uploaded to Blob.
export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const clips: Array<{
      blobUrl: string;
      filename: string;
      durationSec?: number;
      sizeBytes?: number;
    }> = Array.isArray(body.clips) ? body.clips : [];
    if (clips.length === 0) {
      return NextResponse.json({ error: "clips array required" }, { status: 400 });
    }
    const engine: string = body.engine === "shotstack" ? "shotstack" : "wasm";
    const audioMode: string = ["keep", "mute", "track"].includes(body.audioMode) ? body.audioMode : "keep";
    const audioTrackUrl: string | null = typeof body.audioTrackUrl === "string" ? body.audioTrackUrl : null;

    const job = await prisma.mergeJob.create({
      data: {
        status: "draft",
        engine,
        audioMode,
        audioTrackUrl,
        clips: {
          create: clips.map((c, i) => ({
            blobUrl: c.blobUrl,
            filename: c.filename || `clip-${i + 1}.mp4`,
            order: i,
            durationSec: c.durationSec ?? null,
            sizeBytes: c.sizeBytes ?? null,
            transition: i < clips.length - 1 ? "cut" : null,
            transitionDur: i < clips.length - 1 ? 0 : null,
          })),
        },
      },
      include: { clips: { orderBy: { order: "asc" } } },
    });
    await logEdit(job.id, "clip-added", { clipsCreated: clips.length, engine, audioMode });
    return NextResponse.json({ ok: true, job });
  } catch (e: any) {
    console.error("[video jobs create]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
