import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  // Sound BrainReferences
  const soundRefs = await p.brainReference.findMany({
    where: { kind: "sound" },
    select: { name: true, shortDesc: true, longDesc: true },
    take: 40,
  });

  // Nodes about dialogue, lip sync, audio, music, voice
  const nodes = await p.knowledgeNode.findMany({
    where: {
      OR: [
        { tags: { hasSome: ["dialogue", "lip-sync", "lipsync", "audio", "voice", "music", "sound-design", "ADR", "foley", "ambience"] } },
        { title: { contains: "dialogue", mode: "insensitive" } },
        { title: { contains: "lip", mode: "insensitive" } },
        { title: { contains: "voice", mode: "insensitive" } },
        { title: { contains: "music", mode: "insensitive" } },
        { title: { contains: "sound", mode: "insensitive" } },
        { body: { contains: "lip sync", mode: "insensitive" } },
        { body: { contains: "dialogue", mode: "insensitive" } },
      ],
    },
    orderBy: { confidence: "desc" },
    select: { type: true, title: true, body: true, tags: true, confidence: true },
    take: 30,
  });

  // Guides about audio / dialogue / music
  const guides = await p.guide.findMany({
    where: {
      OR: [
        { slug: { contains: "audio" } },
        { slug: { contains: "sound" } },
        { slug: { contains: "dialogue" } },
        { slug: { contains: "voice" } },
        { slug: { contains: "music" } },
        { slug: { contains: "lip" } },
      ],
    },
    select: { slug: true, category: true },
    take: 20,
  });

  console.log("═══════════════════════════════════════════════════════");
  console.log("  AI DIRECTOR — dialogue + music + lip-sync knowledge");
  console.log("═══════════════════════════════════════════════════════\n");

  console.log(`━━━ BrainReference sound (${soundRefs.length}) ━━━`);
  for (const r of soundRefs) {
    console.log(`  · ${r.name}`);
    if (r.shortDesc) console.log(`    ${r.shortDesc.slice(0, 200)}`);
    if (r.longDesc) console.log(`    ${String(r.longDesc).slice(0, 320)}`);
  }

  console.log(`\n━━━ KnowledgeNode (${nodes.length}) ━━━`);
  for (const n of nodes) {
    console.log(`  [${n.type} · ${(n.confidence * 100).toFixed(0)}%] ${n.title}`);
    console.log(`    → ${n.body.slice(0, 220)}`);
    if (n.tags?.length) console.log(`    tags: ${n.tags.slice(0, 6).join(", ")}`);
  }

  console.log(`\n━━━ Guides (${guides.length}) ━━━`);
  for (const g of guides) console.log(`  · ${g.slug} · ${g.category ?? "—"}`);

  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
