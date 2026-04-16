import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";
import { scrapeGuideFromUrl } from "@/lib/learn/guide-scraper";
import { translateGuideToLang } from "@/lib/learn/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

function slugify(text: string): string {
  const ascii = text
    .toLowerCase()
    .replace(/[\u0590-\u05FF\u0600-\u06FF]/g, "") // strip Hebrew + Arabic
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return ascii || "guide";
}

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { url, lang: l } = await req.json();
    if (!url || typeof url !== "string") return NextResponse.json({ error: "url required" }, { status: 400 });
    const lang = isValidLang(l) ? l : DEFAULT_LANG;

    const scraped = await scrapeGuideFromUrl(url);
    const slug = `${slugify(scraped.title) || "guide"}-${Date.now().toString(36).slice(-4)}`;

    const guide = await prisma.guide.create({
      data: {
        slug,
        defaultLang: lang,
        status: "draft",
        isPublic: true,
        source: "url-import",
        sourceUrl: url,
        coverImageUrl: scraped.coverImageUrl,
        translations: {
          create: { lang, title: scraped.title, description: scraped.description, isAuto: false },
        },
        stages: scraped.stages.length > 0 ? {
          create: scraped.stages.map((s, i) => ({
            order: i,
            type: i === 0 ? "start" : i === scraped.stages.length - 1 ? "end" : "middle",
            transitionToNext: "fade",
            translations: { create: { lang, title: s.title, content: s.content, isAuto: false } },
            images: s.images.length > 0 ? {
              create: s.images.map((imgUrl, idx) => ({
                blobUrl: imgUrl,           // store original URL — caller can re-host later
                source: "url-scrape",
                order: idx,
              })),
            } : undefined,
          })),
        } : undefined,
      },
    });

    // Auto-translate to Hebrew if the source wasn't already Hebrew
    if (lang !== "he") {
      waitUntil(translateGuideToLang(guide.id, "he").catch(() => {}));
    }

    return NextResponse.json({ ok: true, guide });
  } catch (e: any) {
    console.error("[guides import-url]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
