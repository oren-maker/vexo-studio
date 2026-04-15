import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";

export const runtime = "nodejs";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF\u0600-\u06FF\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

// Body: { title, description?, lang?, category?, source?, sourceUrl?, coverImageUrl?, isPublic?, stages?: [{title, content}] }
export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const lang = isValidLang(body.lang) ? body.lang : DEFAULT_LANG;
    const title: string = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    let slug = slugify(`${title}-${Date.now().toString(36).slice(-4)}`);
    if (!slug) slug = `guide-${Date.now()}`;

    const stagesInput = Array.isArray(body.stages) ? body.stages : [];

    const guide = await prisma.guide.create({
      data: {
        slug,
        defaultLang: lang,
        status: "draft",
        isPublic: body.isPublic !== false,
        source: body.source || "manual",
        sourceUrl: body.sourceUrl || null,
        coverImageUrl: body.coverImageUrl || null,
        category: body.category || null,
        authorName: body.authorName || null,
        translations: {
          create: {
            lang,
            title,
            description: body.description || null,
            summary: body.summary || null,
            isAuto: false,
          },
        },
        stages: stagesInput.length > 0 ? {
          create: stagesInput.map((s: any, i: number) => ({
            order: i,
            type: i === 0 ? "start" : i === stagesInput.length - 1 ? "end" : "middle",
            transitionToNext: "fade",
            translations: {
              create: {
                lang,
                title: String(s.title || `שלב ${i + 1}`).slice(0, 200),
                content: String(s.content || ""),
                isAuto: !!s.isAuto,
              },
            },
          })),
        } : undefined,
      },
      include: {
        translations: true,
        stages: { include: { translations: true, images: true }, orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json({ ok: true, guide });
  } catch (e: any) {
    console.error("[guides create]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
