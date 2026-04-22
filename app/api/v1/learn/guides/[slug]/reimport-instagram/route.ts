// Re-runs the deep Instagram extractor (carousel + image/video Gemini vision)
// on an existing Guide, overwrites its stages with one stage per carousel item.
// Use when the guide was originally imported with the old caption-only flow.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { extractInstagramDeep } from "@/lib/learn/instagram-deep";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const { slug } = await params;

  const guide = await prisma.guide.findUnique({
    where: { slug },
    include: { stages: { include: { images: true, translations: true } } },
  });
  if (!guide) return NextResponse.json({ error: "guide not found" }, { status: 404 });
  if (!guide.sourceUrl || guide.source !== "instagram") {
    return NextResponse.json({ error: `guide source is "${guide.source}", not instagram` }, { status: 400 });
  }

  const lang = guide.defaultLang || "he";
  const deep = await extractInstagramDeep(guide.sourceUrl);

  // Blow away existing stages; schema cascades kill translations+images.
  if (guide.stages.length > 0) {
    await prisma.guideStage.deleteMany({ where: { guideId: guide.id } });
  }

  // Build new stages — first one = caption, then one per carousel item
  const newStages: { order: number; type: "start" | "middle" | "end"; title: string; content: string; imageUrl?: string }[] = [];

  if (deep.caption) {
    newStages.push({
      order: 0,
      type: "start",
      title: "תיאור הפוסט",
      content: deep.caption,
      imageUrl: deep.thumbnail ?? undefined,
    });
  }

  for (const a of deep.analyses) {
    if (!a.text && a.error) {
      newStages.push({
        order: newStages.length,
        type: "middle",
        title: `שקופית ${a.order + 1}${a.type === "video" ? " · וידאו" : ""}`,
        content: `_(לא נותח: ${a.error})_\n\nקישור ישיר: ${a.url}`,
        imageUrl: a.type === "image" ? a.url : undefined,
      });
      continue;
    }
    // Use the first line of the analysis as stage title if it's short
    const firstLine = a.text.split("\n")[0]?.trim() ?? "";
    const title = firstLine.length > 0 && firstLine.length <= 80 ? firstLine : `שקופית ${a.order + 1}`;
    const body = firstLine.length <= 80 ? a.text.split("\n").slice(1).join("\n").trim() : a.text;
    newStages.push({
      order: newStages.length,
      type: "middle",
      title,
      content: body || a.text,
      imageUrl: a.type === "image" ? a.url : undefined,
    });
  }

  if (newStages.length > 0) {
    // Mark the last one as "end" if it's not already the only stage
    newStages[newStages.length - 1].type = newStages.length === 1 ? "start" : "end";
  }

  // Create all stages + their translations + images
  for (const s of newStages) {
    await prisma.guideStage.create({
      data: {
        guideId: guide.id,
        order: s.order,
        type: s.type,
        transitionToNext: "fade",
        translations: { create: { lang, title: s.title, content: s.content, isAuto: false } },
        images: s.imageUrl ? { create: [{ blobUrl: s.imageUrl, source: "instagram-vision", order: 0 }] } : undefined,
      },
    });
  }

  // Update guide metadata — refresh cover if a carousel image is better than the thumbnail
  const firstImage = deep.analyses.find((a) => a.type === "image" && !a.error)?.url ?? deep.thumbnail;
  await prisma.guide.update({
    where: { id: guide.id },
    data: {
      coverImageUrl: firstImage ?? guide.coverImageUrl,
    },
  });

  return NextResponse.json({
    ok: true,
    guideId: guide.id,
    slug: guide.slug,
    stagesCreated: newStages.length,
    mediaFound: deep.media.length,
    analyzedImages: deep.analyses.filter((a) => a.type === "image" && !a.error).length,
    failedImages: deep.analyses.filter((a) => a.error).length,
    editUrl: `/learn/guides/${guide.slug}/edit`,
    viewUrl: `/learn/guides/${guide.slug}`,
  });
}
