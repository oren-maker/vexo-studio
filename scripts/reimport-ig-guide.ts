/**
 * Re-run the deep Instagram extractor on a specific guide slug, overwrite stages.
 * Usage:
 *   npx tsx scripts/reimport-ig-guide.ts <slug>
 */
import { PrismaClient } from "@prisma/client";
import { extractInstagramDeep } from "../lib/learn/instagram-deep";

const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2];
  if (!slug) { console.error("usage: reimport-ig-guide.ts <slug>"); process.exit(1); }

  const guide = await prisma.guide.findUnique({ where: { slug }, include: { stages: true } });
  if (!guide) { console.error("guide not found"); process.exit(1); }
  if (!guide.sourceUrl || guide.source !== "instagram") { console.error("not an instagram guide"); process.exit(1); }

  console.log(`Re-importing ${slug} from ${guide.sourceUrl}...`);
  const deep = await extractInstagramDeep(guide.sourceUrl);
  console.log(`  caption: ${deep.caption?.length ?? 0} chars`);
  console.log(`  media: ${deep.media.length} items`);
  console.log(`  analyses: ${deep.analyses.filter((a) => !a.error).length} succeeded, ${deep.analyses.filter((a) => a.error).length} failed`);

  // Wipe old stages
  if (guide.stages.length > 0) {
    await prisma.guideStage.deleteMany({ where: { guideId: guide.id } });
    console.log(`  deleted ${guide.stages.length} old stages`);
  }

  const lang = guide.defaultLang || "he";
  let order = 0;
  if (deep.caption) {
    await prisma.guideStage.create({
      data: {
        guideId: guide.id, order: order++, type: "start", transitionToNext: "fade",
        translations: { create: { lang, title: "תיאור הפוסט", content: deep.caption, isAuto: false } },
        images: deep.thumbnail ? { create: [{ blobUrl: deep.thumbnail, source: "instagram", order: 0 }] } : undefined,
      },
    });
  }
  for (const a of deep.analyses) {
    if (!a.text && a.error) continue;
    const firstLine = (a.text ?? "").split("\n")[0]?.trim() ?? "";
    const stageTitle = firstLine.length > 0 && firstLine.length <= 80 ? firstLine : `שקופית ${a.order + 1}`;
    const body = firstLine.length <= 80 ? a.text.split("\n").slice(1).join("\n").trim() : a.text;
    await prisma.guideStage.create({
      data: {
        guideId: guide.id, order: order++, type: "middle", transitionToNext: "fade",
        translations: { create: { lang, title: stageTitle, content: body || a.text, isAuto: false } },
        images: a.type === "image" ? { create: [{ blobUrl: a.url, source: "instagram-vision", order: 0 }] } : undefined,
      },
    });
  }

  // Mark last stage as end
  const all = await prisma.guideStage.findMany({ where: { guideId: guide.id }, orderBy: { order: "desc" }, take: 1 });
  if (all.length > 0 && order > 1) {
    await prisma.guideStage.update({ where: { id: all[0].id }, data: { type: "end" } });
  }

  // Update cover to a better (larger) image if available
  const firstGoodImg = deep.analyses.find((a) => a.type === "image" && !a.error)?.url;
  if (firstGoodImg) {
    await prisma.guide.update({ where: { id: guide.id }, data: { coverImageUrl: firstGoodImg } });
  }

  console.log(`\n✓ Guide ${slug} rebuilt with ${order} stages.`);
  console.log(`  view: https://vexo-studio.vercel.app/learn/guides/${slug}`);
  console.log(`  edit: https://vexo-studio.vercel.app/learn/guides/${slug}/edit`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
