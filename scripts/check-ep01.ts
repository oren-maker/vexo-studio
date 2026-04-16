import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  // Find every series' EP01 with its current state.
  const episodes = await p.episode.findMany({
    where: { episodeNumber: 1 },
    include: {
      season: { include: { series: { select: { title: true, projectId: true, summary: true, genre: true } } } },
      scenes: { orderBy: { sceneNumber: "asc" }, select: { id: true, sceneNumber: true, title: true, summary: true, scriptText: true, targetDurationSeconds: true } },
      characters: { include: { character: { select: { id: true, name: true, roleType: true, appearance: true, personality: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  for (const e of episodes) {
    console.log(`\n=== ${e.season.series.title} · S${e.season.seasonNumber} · EP${e.episodeNumber} ===`);
    console.log(`id=${e.id}`);
    console.log(`title: ${e.title}`);
    console.log(`synopsis: ${e.synopsis ?? "(none)"}`);
    console.log(`targetDurationSeconds: ${e.targetDurationSeconds ?? "(none)"}`);
    console.log(`status: ${e.status}`);
    console.log(`characters cast: ${e.characters.length}`);
    for (const c of e.characters) {
      console.log(`  - ${c.character.name} (${c.character.roleType ?? "—"})`);
    }
    console.log(`scenes: ${e.scenes.length}`);
    for (const s of e.scenes) {
      const hasScript = s.scriptText && s.scriptText.length > 20;
      console.log(`  scene ${s.sceneNumber}: "${s.title ?? s.summary?.slice(0, 60) ?? "(untitled)"}" · ${s.targetDurationSeconds ?? "?"}s · script=${hasScript ? "YES" : "no"}`);
    }
  }
  await p.$disconnect();
})();
