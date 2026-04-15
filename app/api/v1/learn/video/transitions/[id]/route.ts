import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const t = await prisma.mergeTransition.findUnique({ where: { id: params.id } });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(t);
}
