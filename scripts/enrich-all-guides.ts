import { PrismaClient } from "@prisma/client";
import { enrichGuideWithResearch } from "../lib/learn/guide-enrich";

const prisma = new PrismaClient();

async function main() {
  const guides = await prisma.guide.findMany({
    where: {
      // only enrich ones NOT already marked enriched
      source: { not: { contains: "enriched" } },
    },
    include: {
      translations: true,
      stages: { include: { translations: true }, orderBy: { order: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[enrich-all] ${guides.length} guides pending enrichment`);
  let done = 0, failed = 0;
  const t0 = Date.now();

  for (let i = 0; i < guides.length; i++) {
    const g = guides[i];
    const heTrans = g.translations.find((t) => t.lang === "he") || g.translations[0];
    const stageTitles = g.stages.map((s) => {
      const st = s.translations.find((t) => t.lang === "he") || s.translations[0];
      return st?.title || "";
    }).filter(Boolean);

    const label = `[${i + 1}/${guides.length}] ${g.slug}`;
    const tGuide = Date.now();
    try {
      process.stdout.write(`${label} enriching… `);
      const enriched = await enrichGuideWithResearch({
        title: heTrans?.title || g.slug,
        description: heTrans?.description || null,
        category: g.category,
        existingStageTitles: stageTitles,
        lang: "he",
      });
      // Replace stages atomically
      await prisma.guideStage.deleteMany({ where: { guideId: g.id } });
      await prisma.guide.update({
        where: { id: g.id },
        data: {
          category: enriched.category || g.category,
          estimatedMinutes: enriched.estimatedMinutes || g.estimatedMinutes,
          source: g.source ? `${g.source}+enriched` : "enriched",
          updatedAt: new Date(),
          translations: {
            upsert: {
              where: { guideId_lang: { guideId: g.id, lang: "he" } },
              update: { title: enriched.title, description: enriched.description, isAuto: true },
              create: { lang: "he", title: enriched.title, description: enriched.description, isAuto: true },
            },
          },
          stages: {
            create: enriched.stages.map((s, idx) => ({
              order: idx,
              type: s.type,
              transitionToNext: "fade",
              translations: { create: { lang: "he", title: s.title, content: s.content, isAuto: true } },
            })),
          },
        },
      });
      const took = ((Date.now() - tGuide) / 1000).toFixed(1);
      console.log(`✓ ${enriched.stages.length} stages in ${took}s`);
      done++;
    } catch (e: any) {
      const took = ((Date.now() - tGuide) / 1000).toFixed(1);
      console.log(`✗ FAILED after ${took}s: ${String(e?.message || e).slice(0, 150)}`);
      failed++;
    }
  }

  const totalMin = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n[enrich-all] done=${done} failed=${failed} total_time=${totalMin}min`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
