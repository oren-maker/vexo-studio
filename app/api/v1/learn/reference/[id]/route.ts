import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const body = await req.json();
  const data: Record<string, any> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.shortDesc === "string") data.shortDesc = body.shortDesc.trim();
  if (typeof body.longDesc === "string") data.longDesc = body.longDesc.trim();
  if (Array.isArray(body.tags)) data.tags = body.tags.map((t: any) => String(t)).slice(0, 10);
  if (typeof body.order === "number") data.order = body.order;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "no fields" }, { status: 400 });
  try {
    const item = await prisma.brainReference.update({ where: { id: params.id }, data });
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    await prisma.brainReference.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
