import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { renderWithShotstack } from "@/lib/learn/shotstack";
import { logEdit } from "@/lib/learn/merge-edit-log";

export const runtime = "nodejs";
export const maxDuration = 300;

// For wasm engine: just flips status to "processing" and returns. The browser does the work.
// For shotstack engine: dispatches a render request and polls in waitUntil.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const job = await prisma.mergeJob.findUnique({
    where: { id: params.id },
    include: { clips: { orderBy: { order: "asc" } } },
  });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.clips.length === 0) return NextResponse.json({ error: "no clips" }, { status: 400 });

  await prisma.mergeJob.update({
    where: { id: job.id },
    data: { status: "processing", errorMsg: null },
  });
  await logEdit(job.id, "merge-started", { engine: job.engine, clips: job.clips.length });

  if (job.engine === "shotstack") {
    if (!process.env.SHOTSTACK_API_KEY) {
      await prisma.mergeJob.update({
        where: { id: job.id },
        data: { status: "failed", errorMsg: "SHOTSTACK_API_KEY חסר ב-Vercel env vars" },
      });
      return NextResponse.json({ error: "Shotstack not configured" }, { status: 500 });
    }
    waitUntil(
      renderWithShotstack(job.id).catch(async (e) => {
        await prisma.mergeJob.update({
          where: { id: job.id },
          data: { status: "failed", errorMsg: String(e?.message || e).slice(0, 1000) },
        });
      }),
    );
  }

  // wasm engine: nothing to dispatch — the client picks up status=processing and runs ffmpeg.wasm,
  // then POSTs to /wasm-complete with the output blob URL.
  return NextResponse.json({ ok: true, engine: job.engine });
}
