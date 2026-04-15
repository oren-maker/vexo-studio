import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { isValidLang } from "@/lib/learn/guide-languages";

export const runtime = "nodejs";

// Body: { order?, type?, transitionToNext?, lang?, title?, content? }
export async function PATCH(req: NextRequest, { params }: { params: { stageId: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const data: any = {};
    for (const k of ["order", "type", "transitionToNext", "durationSec"]) {
      if (k in body) data[k] = body[k];
    }
    if (Object.keys(data).length > 0) {
      await prisma.guideStage.update({ where: { id: params.stageId }, data });
    }
    if (body.lang && isValidLang(body.lang) && (body.title !== undefined || body.content !== undefined)) {
      await prisma.guideStageTranslation.upsert({
        where: { stageId_lang: { stageId: params.stageId, lang: body.lang } },
        create: {
          stageId: params.stageId,
          lang: body.lang,
          title: body.title || "",
          content: body.content || "",
          isAuto: false,
        },
        update: {
          title: body.title ?? undefined,
          content: body.content ?? undefined,
          isAuto: false,
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[stage patch]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { stageId: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  await prisma.guideStage.delete({ where: { id: params.stageId } });
  return NextResponse.json({ ok: true });
}
