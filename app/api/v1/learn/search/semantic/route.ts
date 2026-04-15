import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { embedText, cosineSim } from "@/lib/learn/gemini-embeddings";

export const runtime = "nodejs";
export const maxDuration = 30;

// Body: { query: string, limit?: number }
export async function POST(req: NextRequest) {
  try {
    const { query, limit } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    const k = Math.max(1, Math.min(50, Number(limit) || 10));

    const queryVec = await embedText(query.trim());

    // Pull all embedded sources (typically <1000 — fits in memory; for larger scale move to pgvector)
    const sources = await prisma.learnSource.findMany({
      where: { embeddedAt: { not: null } },
      select: { id: true, title: true, prompt: true, thumbnail: true, embedding: true, addedBy: true, userRating: true },
      take: 2000,
    });

    const scored = sources
      .map((s) => ({
        id: s.id,
        title: s.title,
        promptHead: s.prompt.slice(0, 200),
        thumbnail: s.thumbnail,
        addedBy: s.addedBy,
        userRating: s.userRating,
        score: cosineSim(queryVec, s.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return NextResponse.json({ ok: true, results: scored, totalCorpus: sources.length });
  } catch (e: any) {
    console.error("[semantic search]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
