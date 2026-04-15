import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET — open if isPublic=true; otherwise admin-only
// ?lang=he — returns translation in that language; if missing, lazily translates via Gemini
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const url = new URL(req.url);
  const lang = isValidLang(url.searchParams.get("lang") || "") ? (url.searchParams.get("lang") as string) : DEFAULT_LANG;

  const guide = await prisma.guide.findUnique({
    where: { slug: params.slug },
    include: {
      translations: true,
      stages: { include: { translations: true, images: true }, orderBy: { order: "asc" } },
    },
  });
  if (!guide) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!guide.isPublic) {
    const unauth = await requireAdmin(req);
    if (unauth) return unauth;
  }

  // Lazy translate if missing in requested lang
  const hasGuideTrans = guide.translations.some((t) => t.lang === lang);
  if (!hasGuideTrans && lang !== guide.defaultLang) {
    try {
      const { translateGuideToLang } = await import("@/lib/learn/translate");
      await translateGuideToLang(guide.id, lang);
      // re-fetch
      const refreshed = await prisma.guide.findUnique({
        where: { id: guide.id },
        include: {
          translations: true,
          stages: { include: { translations: true, images: true }, orderBy: { order: "asc" } },
        },
      });
      return NextResponse.json({ guide: refreshed, lang });
    } catch (e: any) {
      console.warn("[guides GET] lazy translate failed:", e?.message);
    }
  }

  return NextResponse.json({ guide, lang });
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const data: any = {};
    for (const k of ["status", "isPublic", "category", "coverImageUrl", "authorName", "estimatedMinutes"]) {
      if (k in body) data[k] = body[k];
    }
    const guide = await prisma.guide.update({ where: { slug: params.slug }, data });

    // Update or upsert a translation if title/description provided
    if (body.lang && (body.title !== undefined || body.description !== undefined || body.summary !== undefined)) {
      await prisma.guideTranslation.upsert({
        where: { guideId_lang: { guideId: guide.id, lang: body.lang } },
        create: {
          guideId: guide.id,
          lang: body.lang,
          title: body.title || "",
          description: body.description || null,
          summary: body.summary || null,
          isAuto: false,
        },
        update: {
          title: body.title || undefined,
          description: body.description ?? undefined,
          summary: body.summary ?? undefined,
          isAuto: false,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[guides patch]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  await prisma.guide.delete({ where: { slug: params.slug } });
  return NextResponse.json({ ok: true });
}
