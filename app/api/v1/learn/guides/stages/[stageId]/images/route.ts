import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// Body: { blobUrl, caption?, source? }
export async function POST(req: NextRequest, { params }: { params: { stageId: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    if (!body.blobUrl) return NextResponse.json({ error: "blobUrl required" }, { status: 400 });
    const existingCount = await prisma.guideStageImage.count({ where: { stageId: params.stageId } });
    const image = await prisma.guideStageImage.create({
      data: {
        stageId: params.stageId,
        blobUrl: body.blobUrl,
        caption: body.caption || null,
        source: body.source || "upload",
        order: existingCount,
      },
    });
    return NextResponse.json({ ok: true, image });
  } catch (e: any) {
    console.error("[stage image create]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { stageId: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const url = new URL(req.url);
  const imageId = url.searchParams.get("imageId");
  if (!imageId) return NextResponse.json({ error: "imageId required" }, { status: 400 });
  await prisma.guideStageImage.delete({ where: { id: imageId } });
  return NextResponse.json({ ok: true });
}
