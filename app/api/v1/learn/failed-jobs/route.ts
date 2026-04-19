import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// List failed GeneratedVideo jobs with enough context to retry.
// Groups failures that share the same sourceId+model so the UI doesn't show
// 12 rows for the same underlying issue.
export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const videos = await prisma.generatedVideo.findMany({
    where: { status: "failed" },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true, sourceId: true, model: true, usdCost: true, durationSec: true,
      aspectRatio: true, error: true, promptHead: true, startedAt: true, updatedAt: true,
    },
  });

  const sourceIds = [...new Set(videos.map((v) => v.sourceId))];
  const sources = await prisma.learnSource.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, title: true, prompt: true },
  });
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  const enriched = videos.map((v) => ({
    ...v,
    source: sourceMap.get(v.sourceId) ?? null,
  }));

  return NextResponse.json({ ok: true, count: enriched.length, jobs: enriched });
}
