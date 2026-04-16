import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/learn/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const logs = await (prisma as any).sceneLog.findMany({
    where: { sceneId: params.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ logs });
}
