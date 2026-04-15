import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const v = await prisma.generatedVideo.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      progressPct: true,
      progressMessage: true,
      blobUrl: true,
      usdCost: true,
      model: true,
      durationSec: true,
      error: true,
      startedAt: true,
      completedAt: true,
    },
  });
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  const elapsedSec = Math.round((Date.now() - v.startedAt.getTime()) / 1000);
  return NextResponse.json({ ...v, elapsedSec });
}
