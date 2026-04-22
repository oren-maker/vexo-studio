import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";
import { extractInstagramDeep } from "@/lib/learn/instagram-deep";
import { translateGuideToLang } from "@/lib/learn/translate";

export const runtime = "nodejs";
export const maxDuration = 300;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF\u0600-\u06FF\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { url, lang: l } = await req.json();
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
    const lang = isValidLang(l) ? l : DEFAULT_LANG;

    const ig = await extractInstagramDeep(url);
    const title = (ig.caption || "Instagram guide").split(/[.!?\n]/)[0].slice(0, 200);
    const description = ig.caption?.slice(0, 500) || null;
    const slug = `${slugify(title) || "ig-guide"}-${Date.now().toString(36).slice(-4)}`;

    // Build stages: caption first, then one per analyzed carousel item
    const stagesData: {
      order: number; type: "start" | "middle" | "end"; transitionToNext: string;
      translations: { create: { lang: string; title: string; content: string; isAuto: boolean } };
      images?: { create: { blobUrl: string; source: string; order: number }[] };
    }[] = [];
    if (ig.caption) {
      stagesData.push({
        order: 0, type: "start", transitionToNext: "fade",
        translations: { create: { lang, title: title || "תוכן הפוסט", content: ig.caption, isAuto: false } },
        images: ig.thumbnail ? { create: [{ blobUrl: ig.thumbnail, source: "instagram", order: 0 }] } : undefined,
      });
    }
    for (const a of ig.analyses) {
      if (!a.text && a.error) continue;
      const firstLine = (a.text ?? "").split("\n")[0]?.trim() ?? "";
      const stageTitle = firstLine.length > 0 && firstLine.length <= 80 ? firstLine : `שקופית ${a.order + 1}`;
      const body = firstLine.length <= 80 ? a.text.split("\n").slice(1).join("\n").trim() : a.text;
      stagesData.push({
        order: stagesData.length, type: "middle", transitionToNext: "fade",
        translations: { create: { lang, title: stageTitle, content: body || a.text, isAuto: false } },
        images: a.type === "image" ? { create: [{ blobUrl: a.url, source: "instagram-vision", order: 0 }] } : undefined,
      });
    }
    if (stagesData.length > 1) stagesData[stagesData.length - 1].type = "end";

    const guide = await prisma.guide.create({
      data: {
        slug, defaultLang: lang, status: "draft", isPublic: true,
        source: "instagram", sourceUrl: ig.sourceUrl,
        coverImageUrl: ig.thumbnail,
        translations: { create: { lang, title, description, isAuto: false } },
        stages: stagesData.length > 0 ? { create: stagesData } : undefined,
      },
    });
    if (lang !== "he") {
      waitUntil(translateGuideToLang(guide.id, "he").catch(() => {}));
    }
    return NextResponse.json({
      ok: true,
      guide,
      carousel: { items: ig.media.length, analyzed: ig.analyses.filter((a) => !a.error).length, failed: ig.analyses.filter((a) => a.error).length },
    });
  } catch (e: any) {
    console.error("[guides import-instagram]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
