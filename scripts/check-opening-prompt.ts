import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const openings = await p.seasonOpening.findMany({
    include: {
      season: { select: { seasonNumber: true, series: { select: { title: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  for (const o of openings) {
    console.log(`\n=== ${o.season.series.title} / Season ${o.season.seasonNumber} ===`);
    console.log(`model=${o.model} · duration=${o.duration}s · aspect=${o.aspectRatio} · status=${o.status}`);
    console.log(`updated=${o.updatedAt.toISOString()}`);
    console.log(`prompt:\n${o.currentPrompt}\n`);
    const versions = await p.seasonOpeningPromptVersion.findMany({
      where: { openingId: o.id },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    console.log(`(${versions.length} older versions)`);
  }
  await p.$disconnect();
})();
