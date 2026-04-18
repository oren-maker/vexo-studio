/**
 * Survey all SeasonOpening rows that successfully rendered videos with
 * multiple characters. Goal: understand which model + prompt pattern +
 * reference-image strategy produced character-faithful openings.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  const all = await p.seasonOpening.findMany({
    include: {
      season: { include: { series: { include: { project: { select: { name: true } } } } } },
      versions: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`Total openings (any status): ${all.length}\n`);

  for (const o of all) {
    const cast = o.includeCharacters && o.characterIds.length > 0
      ? await p.character.findMany({ where: { id: { in: o.characterIds } }, select: { name: true, media: { select: { fileUrl: true, metadata: true } } } })
      : [];
    const assets = await p.asset.findMany({
      where: { entityType: "SEASON_OPENING", entityId: o.id, assetType: "VIDEO", status: "READY" },
      orderBy: { createdAt: "desc" },
    });
    console.log("=".repeat(80));
    console.log(`🎬 "${o.season.series.title}" S${o.season.seasonNumber} (${o.season.series.project.name})`);
    console.log(`   id=${o.id} status=${o.status}`);
    console.log(`   model=${o.model} · provider=${o.provider} · duration=${o.duration}s · aspect=${o.aspectRatio}`);
    console.log(`   includeCharacters=${o.includeCharacters} cast=(${cast.length}): ${cast.map((c) => `${c.name}[${c.media.length}refs]`).join(", ") || "(none)"}`);
    console.log(`   ${assets.length} ready video assets:`);
    for (const a of assets.slice(0, 3)) {
      const m = a.metadata as any;
      console.log(`     - ${a.createdAt.toISOString().slice(0, 16)} ${m?.provider ?? "?"}/${m?.model ?? "?"} cost=$${m?.costUsd ?? "?"} url=${a.fileUrl.slice(0, 60)}`);
    }
    console.log(`   currentPrompt (${o.currentPrompt.length} chars):`);
    console.log(`     ${o.currentPrompt.slice(0, 800).replace(/\n/g, "\n     ")}${o.currentPrompt.length > 800 ? "..." : ""}`);
    if (o.versions.length > 0) {
      console.log(`   ${o.versions.length} prior prompt versions (oldest first):`);
      for (const v of o.versions.slice(-3).reverse()) {
        console.log(`     · ${v.createdAt.toISOString().slice(0, 16)}: ${v.prompt.slice(0, 200).replace(/\n/g, " ")}...`);
      }
    }
    console.log();
  }

  await p.$disconnect();
})();
