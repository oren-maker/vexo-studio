import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";
import { extractInstagram } from "@/lib/learn/instagram";
import { translateGuideToLang } from "@/lib/learn/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const ig = await extractInstagram(url);
    const title = (ig.caption || "Instagram guide").split(/[.!?\n]/)[0].slice(0, 200);
    const description = ig.caption?.slice(0, 500) || null;
    const slug = `${slugify(title) || "ig-guide"}-${Date.now().toString(36).slice(-4)}`;

    const guide = await prisma.guide.create({
      data: {
        slug,
        defaultLang: lang,
        status: "draft",
        isPublic: true,
        source: "instagram",
        sourceUrl: ig.sourceUrl,
        coverImageUrl: ig.thumbnail,
        translations: {
          create: { lang, title, description, isAuto: false },
        },
        stages: ig.caption ? {
          create: [{
            order: 0,
            type: "start",
            transitionToNext: "fade",
            translations: {
              create: { lang, title: title || "תוכן הפוסט", content: ig.caption || "", isAuto: false },
            },
            images: ig.thumbnail ? {
              create: [{ blobUrl: ig.thumbnail, source: "instagram", order: 0 }],
            } : undefined,
          }],
        } : undefined,
      },
    });
    if (lang !== "he") {
      waitUntil(translateGuideToLang(guide.id, "he").catch(() => {}));
    }
    return NextResponse.json({ ok: true, guide });
  } catch (e: any) {
    console.error("[guides import-instagram]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
