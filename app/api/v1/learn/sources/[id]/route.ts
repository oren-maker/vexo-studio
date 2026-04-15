import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const source = await prisma.learnSource.findUnique({
    where: { id: params.id },
    include: { analysis: true },
  });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(source);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const src = await prisma.learnSource.findUnique({ where: { id: params.id } });
  if (src?.blobUrl && src.type === "upload") {
    try {
      await del(src.blobUrl);
    } catch {}
  }
  await prisma.learnSource.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
