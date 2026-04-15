import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const analysis = await prisma.videoAnalysis.findUnique({
    where: { sourceId: params.id },
    include: { knowledgeNodes: true, source: true },
  });
  if (!analysis) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(analysis);
}
