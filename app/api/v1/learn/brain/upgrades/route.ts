import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const upgrades = await prisma.brainUpgradeRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json({ upgrades });
}

export async function PATCH(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const { id, status, claudeNotes } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const data: any = {};
  if (status) data.status = status;
  if (claudeNotes !== undefined) data.claudeNotes = claudeNotes;
  if (status === "done") data.implementedAt = new Date();
  const updated = await prisma.brainUpgradeRequest.update({ where: { id }, data });
  return NextResponse.json({ ok: true, upgrade: updated });
}
