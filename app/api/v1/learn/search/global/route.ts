import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// Global search across 5 entity types — ILIKE instead of tsvector so we
// don't depend on a DB extension. Fast enough for the scale we're at
// (few thousand scenes, few hundred guides, few thousand learn-sources).
// Returns grouped results; UI renders as category sections.

const MAX_PER_KIND = 8;

export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, query: q, results: { scenes: [], guides: [], sources: [], characters: [], refs: [] }, total: 0 });

  const ilike = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  const [scenes, guides, sources, characters, refs] = await Promise.all([
    prisma.scene.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { scriptText: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, sceneNumber: true, title: true, summary: true, status: true, episodeId: true, episode: { select: { episodeNumber: true, seasonId: true, season: { select: { series: { select: { title: true } } } } } } },
      take: MAX_PER_KIND,
    }),
    prisma.guide.findMany({
      where: {
        OR: [
          { slug: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { translations: { some: { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } } },
        ],
      },
      select: { id: true, slug: true, category: true, coverImageUrl: true, translations: { where: { lang: "he" }, select: { title: true, description: true } } },
      take: MAX_PER_KIND,
    }),
    prisma.learnSource.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { prompt: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true, prompt: true, type: true, status: true },
      take: MAX_PER_KIND,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.character.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { appearance: { contains: q, mode: "insensitive" } },
          { personality: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, roleType: true, appearance: true },
      take: MAX_PER_KIND,
    }),
    prisma.brainReference.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { shortDesc: { contains: q, mode: "insensitive" } },
          { longDesc: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, kind: true, name: true, shortDesc: true },
      take: MAX_PER_KIND,
    }),
  ]);
  // Silence the unused `ilike` variable; keeping it for potential raw-SQL fallback.
  void ilike;

  return NextResponse.json({
    ok: true,
    query: q,
    results: { scenes, guides, sources, characters, refs },
    total: scenes.length + guides.length + sources.length + characters.length + refs.length,
  });
}
