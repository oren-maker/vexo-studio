import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await prisma.trimSession.findUnique({
    where: { id: params.id },
    include: { scenes: { orderBy: { order: "asc" } } },
  });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(session);
}

// Body: { scenes: [{id, selected}] }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    if (Array.isArray(body.scenes)) {
      await Promise.all(
        body.scenes.map((s: any) =>
          prisma.trimScene.update({ where: { id: s.id }, data: { selected: !!s.selected } }),
        ),
      );
    }
    const session = await prisma.trimSession.findUnique({
      where: { id: params.id },
      include: { scenes: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json({ ok: true, session });
  } catch (e: any) {
    console.error("[trim sessions patch]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
