/**
 * Consult the AI Director (brain) about how to improve the video-generation
 * base prompt. Pulls BrainReference + KnowledgeNodes + Guides that are
 * relevant to scene continuity, i2v chaining, and video prompt composition.
 * Prints a digest so Claude can use it before editing the prompt builder.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  // 1) Relevant BrainReference entries (cinematography + capability)
  const refs = await p.brainReference.findMany({
    where: {
      OR: [
        { kind: "cinematography" },
        { kind: "capability" },
        { name: { contains: "continuity" } },
        { name: { contains: "bridge" } },
        { name: { contains: "i2v" } },
        { name: { contains: "scene" } },
      ],
    },
    select: { kind: true, name: true, shortDesc: true, longDesc: true },
    take: 20,
  });

  // 2) KnowledgeNodes tagged with continuity / transition / i2v / scene
  const nodes = await p.knowledgeNode.findMany({
    where: {
      OR: [
        { tags: { hasSome: ["continuity", "transition", "match-cut", "bridge", "i2v", "seed", "chain"] } },
        { title: { contains: "continuity", mode: "insensitive" } },
        { title: { contains: "transition", mode: "insensitive" } },
        { body: { contains: "last frame", mode: "insensitive" } },
      ],
    },
    orderBy: { confidence: "desc" },
    select: { type: true, title: true, body: true, tags: true, confidence: true },
    take: 20,
  });

  // 3) Guides about scene structure / transitions / video prompts
  const guides = await p.guide.findMany({
    where: {
      OR: [
        { slug: { contains: "continuity" } },
        { slug: { contains: "transition" } },
        { slug: { contains: "i2v" } },
        { slug: { contains: "video-prompt" } },
        { slug: { contains: "scene" } },
      ],
    },
    select: { slug: true, category: true, userRating: true },
    take: 15,
  });

  // 4) Latest DailyBrainCache identity + learnings
  const brain = await p.dailyBrainCache.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, identity: true, todayLearnings: true, tomorrowFocus: true },
  });

  console.log("═══════════════════════════════════════════════════════");
  console.log("  AI DIRECTOR CONSULTATION — scene-continuity prompt");
  console.log("═══════════════════════════════════════════════════════\n");

  console.log(`🧠 Brain identity (${brain?.date?.toISOString().slice(0, 10) ?? "—"}):\n${brain?.identity?.slice(0, 600) ?? "(none)"}\n`);

  console.log(`━━━ BrainReference (${refs.length}) ━━━`);
  for (const r of refs) {
    console.log(`  [${r.kind}] ${r.name}`);
    if (r.shortDesc) console.log(`    short: ${r.shortDesc.slice(0, 160)}`);
    if (r.longDesc) console.log(`    long: ${String(r.longDesc).slice(0, 280)}`);
  }

  console.log(`\n━━━ KnowledgeNode (${nodes.length}, top confidence) ━━━`);
  for (const n of nodes) {
    console.log(`  [${n.type} · ${(n.confidence * 100).toFixed(0)}%] ${n.title}`);
    console.log(`    → ${n.body.slice(0, 200)}`);
    if (n.tags?.length) console.log(`    tags: ${n.tags.slice(0, 6).join(", ")}`);
  }

  console.log(`\n━━━ Guides (${guides.length}) ━━━`);
  for (const g of guides) {
    console.log(`  · ${g.slug} · ${g.category ?? "—"} · rating=${g.userRating ?? "—"}`);
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Use these to inform the prompt builder edit.");
  console.log("═══════════════════════════════════════════════════════");

  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
