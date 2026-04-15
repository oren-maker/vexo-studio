import { NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sources = await prisma.learnSource.findMany({
    where: { status: "complete", analysis: { isNot: null } },
    include: { analysis: true },
    take: 100,
  });
  const scored = sources
    .filter((s) => s.analysis)
    .map((s) => {
      const techniques = s.analysis!.techniques.length;
      const words = s.prompt.split(/\s+/).length;
      const hasTimecodes = /\b\d{1,2}:\d{2}\b/.test(s.prompt) ? 1 : 0;
      const score = techniques * 3 + words / 40 + hasTimecodes * 3;
      return { s, score, techniques, words, hasTimecodes };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return NextResponse.json(
    scored.map(({ s, techniques, words, hasTimecodes }) => ({
      id: s.id,
      title: s.title,
      techniques,
      words,
      hasTimecodes,
      prompt: s.prompt,
      analysisTechniques: s.analysis!.techniques,
      analysisTags: s.analysis!.tags,
      style: s.analysis!.style,
      mood: s.analysis!.mood,
    })),
  );
}
