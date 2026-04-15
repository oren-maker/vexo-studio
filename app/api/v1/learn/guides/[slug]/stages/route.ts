import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";

export const runtime = "nodejs";

// Body: { title, content?, type?, transitionToNext?, lang? }
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const lang = isValidLang(body.lang) ? body.lang : DEFAULT_LANG;
    const guide = await prisma.guide.findUnique({ where: { slug: params.slug }, include: { stages: true } });
    if (!guide) return NextResponse.json({ error: "guide not found" }, { status: 404 });

    const order = guide.stages.length;
    const type = body.type || (order === 0 ? "start" : "middle");

    const stage = await prisma.guideStage.create({
      data: {
        guideId: guide.id,
        order,
        type,
        transitionToNext: body.transitionToNext || "fade",
        translations: {
          create: {
            lang,
            title: String(body.title || `שלב ${order + 1}`).slice(0, 200),
            content: String(body.content || ""),
            isAuto: false,
          },
        },
      },
      include: { translations: true, images: true },
    });
    return NextResponse.json({ ok: true, stage });
  } catch (e: any) {
    console.error("[stages create]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
