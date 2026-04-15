import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/learn/db";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";
import { renderGuidePdf } from "@/lib/learn/guide-pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
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
      // For private guides, require admin (basic check — header-based)
      const adminKey = req.headers.get("x-admin-key");
      if (process.env.ADMIN_API_KEY && adminKey !== process.env.ADMIN_API_KEY) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    // Lazy translate if missing
    const hasGuideTrans = guide.translations.some((t) => t.lang === lang);
    if (!hasGuideTrans && lang !== guide.defaultLang) {
      const { translateGuideToLang } = await import("@/lib/learn/translate");
      try { await translateGuideToLang(guide.id, lang); } catch {}
    }

    const refreshed = await prisma.guide.findUnique({
      where: { id: guide.id },
      include: {
        translations: true,
        stages: { include: { translations: true, images: true }, orderBy: { order: "asc" } },
      },
    });
    if (!refreshed) return NextResponse.json({ error: "not found" }, { status: 404 });

    const trans = refreshed.translations.find((t) => t.lang === lang) || refreshed.translations.find((t) => t.lang === refreshed.defaultLang);
    if (!trans) return NextResponse.json({ error: "no translation" }, { status: 500 });

    const data = {
      title: trans.title,
      description: trans.description,
      coverImageUrl: refreshed.coverImageUrl,
      authorName: refreshed.authorName,
      category: refreshed.category,
      estimatedMinutes: refreshed.estimatedMinutes,
      lang,
      stages: refreshed.stages.map((s) => {
        const st = s.translations.find((t) => t.lang === lang) || s.translations.find((t) => t.lang === refreshed.defaultLang) || s.translations[0];
        return {
          order: s.order,
          type: s.type,
          title: st?.title || "",
          content: st?.content || "",
          images: s.images.map((img) => ({ blobUrl: img.blobUrl, caption: img.caption })),
        };
      }),
    };

    const buffer = await renderGuidePdf(data);

    // Cache to Blob
    const filename = `guides/${refreshed.slug}-${lang}-${Date.now()}.pdf`;
    const blob = await put(filename, buffer, { access: "public", contentType: "application/pdf" });
    await prisma.guide.update({ where: { id: refreshed.id }, data: { pdfBlobUrl: blob.url, pdfGeneratedAt: new Date() } });

    // Stream the PDF directly so the user gets the file in this response
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${refreshed.slug}-${lang}.pdf"`,
        "X-Cached-Url": blob.url,
      },
    });
  } catch (e: any) {
    console.error("[guides pdf]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
