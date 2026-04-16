import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { enrichGuideWithResearch } from "@/lib/learn/guide-enrich";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const guide = await prisma.guide.findUnique({
      where: { slug: params.slug },
      include: {
        translations: true,
        stages: { include: { translations: true }, orderBy: { order: "asc" } },
      },
    });
    if (!guide) return NextResponse.json({ error: "not found" }, { status: 404 });

    const heTrans = guide.translations.find((t) => t.lang === "he") || guide.translations[0];
    const stageTitles = guide.stages.map((s) => {
      const st = s.translations.find((t) => t.lang === "he") || s.translations[0];
      return st?.title || "";
    }).filter(Boolean);

    const enriched = await enrichGuideWithResearch({
      title: heTrans?.title || guide.slug,
      description: heTrans?.description || null,
      category: guide.category,
      existingStageTitles: stageTitles,
      lang: "he",
    });

    // Replace stages atomically — delete existing, create new
    await prisma.guideStage.deleteMany({ where: { guideId: guide.id } });

    await prisma.guide.update({
      where: { id: guide.id },
      data: {
        category: enriched.category || guide.category,
        estimatedMinutes: enriched.estimatedMinutes || guide.estimatedMinutes,
        source: guide.source ? `${guide.source}+enriched` : "enriched",
        updatedAt: new Date(),
        translations: {
          upsert: {
            where: { guideId_lang: { guideId: guide.id, lang: "he" } },
            update: { title: enriched.title, description: enriched.description, isAuto: true },
            create: { lang: "he", title: enriched.title, description: enriched.description, isAuto: true },
          },
        },
        stages: {
          create: enriched.stages.map((s, i) => ({
            order: i,
            type: s.type,
            transitionToNext: "fade",
            translations: { create: { lang: "he", title: s.title, content: s.content, isAuto: true } },
          })),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      slug: guide.slug,
      stages: enriched.stages.length,
      title: enriched.title,
      estimatedMinutes: enriched.estimatedMinutes,
    });
  } catch (e: any) {
    console.error("[enrich]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
