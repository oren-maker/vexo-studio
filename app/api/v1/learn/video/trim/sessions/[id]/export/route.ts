import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { logEdit } from "@/lib/learn/merge-edit-log";

export const runtime = "nodejs";

// Convert selected scenes from a TrimSession into a fresh MergeJob.
// Returns the new jobId. Caller should redirect to /video/jobs/[id] or /video/merge?jobId=...
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const session = await prisma.trimSession.findUnique({
    where: { id: params.id },
    include: { scenes: { where: { selected: true }, orderBy: { order: "asc" } } },
  });
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });
  if (session.scenes.length === 0) {
    return NextResponse.json({ error: "no scenes selected" }, { status: 400 });
  }

  const job = await prisma.mergeJob.create({
    data: {
      status: "draft",
      engine: "wasm",
      audioMode: "keep",
      clips: {
        create: session.scenes.map((s, i) => ({
          blobUrl: session.inputBlobUrl,
          filename: session.filename,
          order: i,
          trimStart: s.startSec,
          trimEnd: s.endSec,
          durationSec: s.endSec - s.startSec,
          transition: i < session.scenes.length - 1 ? "cut" : null,
          transitionDur: i < session.scenes.length - 1 ? 0 : null,
        })),
      },
    },
    include: { clips: { orderBy: { order: "asc" } } },
  });

  await logEdit(job.id, "clip-added", { source: "trim-export", trimSessionId: session.id, clipsCreated: session.scenes.length });

  return NextResponse.json({ ok: true, jobId: job.id });
}
