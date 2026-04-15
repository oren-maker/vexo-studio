import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { runAutoImprovement } from "@/lib/learn/auto-improve";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const run = url.searchParams.get("run") === "1";
  // GET with side-effect requires admin auth
  if (run) {
    const unauth = await requireAdmin(req);
    if (unauth) return unauth;
  }

  const total = await prisma.learnSource.count();
  const complete = await prisma.learnSource.count({ where: { status: "complete" } });
  const withAnalysis = await prisma.learnSource.count({ where: { analysis: { isNot: null } } });
  const completeWithAnalysis = await prisma.learnSource.count({
    where: { status: "complete", analysis: { isNot: null } },
  });
  const byStatus = await prisma.learnSource.groupBy({ by: ["status"], _count: true });

  const candidates = await prisma.learnSource.findMany({
    where: { status: "complete", analysis: { isNot: null } },
    include: { analysis: true },
    take: 50,
  });
  const ranked = candidates
    .filter((s) => s.analysis)
    .map((s) => {
      const techniques = s.analysis!.techniques.length;
      const words = s.prompt.split(/\s+/).length;
      const hasTimecodes = /\b\d{1,2}:\d{2}\b/.test(s.prompt) ? 1 : 0;
      const score = techniques * 3 + Math.min(words / 40, 10) + hasTimecodes * 2;
      return { id: s.id, title: s.title, techniques, words, hasTimecodes, score };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const base: any = {
    total,
    complete,
    withAnalysis,
    completeWithAnalysis,
    byStatus,
    topWeakest: ranked,
    geminiKeySet: !!process.env.GEMINI_API_KEY,
  };

  if (run) {
    const latestSnapshot = await prisma.insightsSnapshot.findFirst({ orderBy: { takenAt: "desc" } });
    if (!latestSnapshot) {
      base.runResult = { ok: false, error: "no snapshot exists" };
    } else {
      try {
        const r = await runAutoImprovement(latestSnapshot.id, 2);
        base.runResult = { ok: true, snapshotId: latestSnapshot.id, ...r };
      } catch (e: any) {
        base.runResult = { ok: false, error: String(e.message || e).slice(0, 500) };
      }
    }
  }

  return NextResponse.json(base);
}
