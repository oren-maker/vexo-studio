import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

// Returns Seedance/CeDance reference prompts for use as style examples in downstream
// generation pipelines (VEXO Studio storyboard, Director, etc.). Matches prompts by
// simple text search; ranks by presence of query keywords.
//
// Auth: x-internal-key header must match INTERNAL_API_KEY.
// GET /api/internal/reference-prompts?q=<query>&limit=3&withVideo=true

function checkAuth(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  return key && key === process.env.INTERNAL_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(10, Math.max(1, Number(searchParams.get("limit") || 3)));
  const withVideo = searchParams.get("withVideo") === "true";

  // Extract keywords from query (split on spaces, drop stopwords + short words)
  const STOP = new Set(["a", "an", "the", "of", "and", "or", "in", "to", "with", "for", "on", "at"]);
  const keywords = q
    .toLowerCase()
    .split(/[\s,.]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .slice(0, 8);

  const where: any = { type: "cedance", status: "complete" };
  if (withVideo) where.blobUrl = { not: null };

  if (keywords.length === 0) {
    // No query — return a diverse sample.
    const items = await prisma.learnSource.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ items: items.map(simplify) });
  }

  // Fuzzy search: OR of keyword contains on prompt and title.
  where.OR = keywords.flatMap((k) => [
    { prompt: { contains: k, mode: "insensitive" as const } },
    { title: { contains: k, mode: "insensitive" as const } },
  ]);

  const candidates = await prisma.learnSource.findMany({
    where,
    take: limit * 8,
    orderBy: { createdAt: "desc" },
  });

  // Score by keyword hits
  const scored = candidates.map((c) => {
    const hay = `${c.title || ""}\n${c.prompt}`.toLowerCase();
    let score = 0;
    for (const k of keywords) {
      const matches = hay.split(k).length - 1;
      score += matches;
    }
    if (c.blobUrl) score += 1; // small bonus for having video
    return { c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).map((s) => s.c);

  return NextResponse.json({
    query: q,
    keywords,
    items: top.map(simplify),
  });
}

function simplify(s: any) {
  return {
    id: s.id,
    externalId: s.externalId,
    title: s.title,
    prompt: s.prompt,
    videoUrl: s.blobUrl,
    thumbnail: s.thumbnail,
    sourceUrl: s.url,
    author: s.addedBy,
  };
}
