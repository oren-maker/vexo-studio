import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";
import { generateGuideFromTopic } from "@/lib/learn/guide-ai";
import { translateGuideToLang } from "@/lib/learn/translate";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    const { topic, lang: l } = await req.json();
    if (!topic || typeof topic !== "string") return NextResponse.json({ error: "topic required" }, { status: 400 });
    const lang = isValidLang(l) ? l : DEFAULT_LANG;
    const ai = await generateGuideFromTopic(topic, lang);
    const slug = `${slugify(ai.title || topic) || "guide"}-${Date.now().toString(36).slice(-4)}`;
    const guide = await prisma.guide.create({
      data: {
        slug,
        defaultLang: lang,
        status: "draft",
        isPublic: true,
        source: "ai-generated",
        category: ai.category || null,
        estimatedMinutes: ai.estimatedMinutes || null,
        translations: {
          create: { lang, title: ai.title, description: ai.description, isAuto: true },
        },
        stages: {
          create: ai.stages.map((s, i) => ({
            order: i,
            type: s.type,
            transitionToNext: "fade",
            translations: { create: { lang, title: s.title, content: s.content, isAuto: true } },
          })),
        },
      },
    });
    if (lang !== "he") {
      waitUntil(translateGuideToLang(guide.id, "he").catch(() => {}));
    }
    return NextResponse.json({ ok: true, guide });
  } catch (e: any) {
    console.error("[ai-create]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
