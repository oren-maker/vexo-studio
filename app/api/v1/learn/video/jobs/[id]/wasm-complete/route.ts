import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { logEdit } from "@/lib/learn/merge-edit-log";

export const runtime = "nodejs";

// Called by the browser after ffmpeg.wasm finishes and uploads the merged file to Blob.
// Body: { outputUrl: string, outputDuration?: number, errorMsg?: string }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const body = await req.json().catch(() => ({}));
  if (body.errorMsg) {
    await prisma.mergeJob.update({
      where: { id: params.id },
      data: { status: "failed", errorMsg: String(body.errorMsg).slice(0, 1000), completedAt: new Date() },
    });
    await logEdit(params.id, "merge-failed", { error: String(body.errorMsg).slice(0, 200) });
    return NextResponse.json({ ok: true });
  }
  if (!body.outputUrl) return NextResponse.json({ error: "outputUrl required" }, { status: 400 });
  await prisma.mergeJob.update({
    where: { id: params.id },
    data: {
      status: "complete",
      outputUrl: body.outputUrl,
      outputDuration: typeof body.outputDuration === "number" ? body.outputDuration : null,
      completedAt: new Date(),
    },
  });
  await logEdit(params.id, "merge-completed", { outputDuration: body.outputDuration, outputUrl: body.outputUrl });
  return NextResponse.json({ ok: true });
}
