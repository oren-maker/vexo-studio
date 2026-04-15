import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { runId: string } }) {
  const run = await prisma.improvementRun.findUnique({ where: { id: params.runId } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const versions = await prisma.promptVersion.findMany({
    where: { triggeredBy: "auto-improve", snapshotId: run.snapshotId },
    orderBy: { createdAt: "desc" },
  });
  const sources = versions.length
    ? await prisma.learnSource.findMany({
        where: { id: { in: versions.map((v) => v.sourceId) } },
        select: { id: true, title: true, prompt: true },
      })
    : [];
  const byId: Record<string, any> = {};
  for (const s of sources) byId[s.id] = s;
  return NextResponse.json({
    run,
    upgrades: versions.map((v) => ({
      sourceId: v.sourceId,
      title: byId[v.sourceId]?.title,
      reason: v.reason,
      version: v.version,
      before: v.prompt,
      beforeWords: v.prompt.split(/\s+/).length,
      after: byId[v.sourceId]?.prompt || "",
      afterWords: (byId[v.sourceId]?.prompt || "").split(/\s+/).length,
    })),
  });
}
