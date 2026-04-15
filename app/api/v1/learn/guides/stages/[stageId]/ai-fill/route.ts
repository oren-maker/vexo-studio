import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { generateStageContent } from "@/lib/learn/guide-ai";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";

export const runtime = "nodejs";
export const maxDuration = 60;

// Body: { lang? }
export async function POST(req: NextRequest, { params }: { params: { stageId: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json().catch(() => ({}));
    const lang = isValidLang(body.lang) ? body.lang : DEFAULT_LANG;
    const stage = await prisma.guideStage.findUnique({
      where: { id: params.stageId },
      include: { translations: true, guide: { include: { translations: true } } },
    });
    if (!stage) return NextResponse.json({ error: "stage not found" }, { status: 404 });

    const guideTitle = stage.guide.translations.find((t) => t.lang === lang)?.title
      || stage.guide.translations.find((t) => t.lang === stage.guide.defaultLang)?.title
      || "";
    const stageTitle = stage.translations.find((t) => t.lang === lang)?.title || `שלב ${stage.order + 1}`;

    const content = await generateStageContent(guideTitle, stageTitle, lang);

    await prisma.guideStageTranslation.upsert({
      where: { stageId_lang: { stageId: stage.id, lang } },
      create: { stageId: stage.id, lang, title: stageTitle, content, isAuto: true },
      update: { content, isAuto: true },
    });

    return NextResponse.json({ ok: true, content });
  } catch (e: any) {
    console.error("[stage ai-fill]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
