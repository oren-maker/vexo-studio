import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

function checkAuth(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  return key && key === process.env.INTERNAL_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Number(searchParams.get("limit") || 50));

  const nodes = await prisma.knowledgeNode.findMany({
    where: { sentToDirector: false },
    orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
    take: limit,
    include: { analysis: { include: { source: true } } },
  });

  return NextResponse.json({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      tags: n.tags,
      confidence: n.confidence,
      context: {
        style: n.analysis.style,
        mood: n.analysis.mood,
        difficulty: n.analysis.difficulty,
        tags: n.analysis.tags,
      },
      sourceType: "vexo-learn",
      sourceId: n.analysis.sourceId,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { nodeIds } = await req.json();
  if (!Array.isArray(nodeIds)) return NextResponse.json({ error: "nodeIds array" }, { status: 400 });

  await prisma.knowledgeNode.updateMany({
    where: { id: { in: nodeIds } },
    data: { sentToDirector: true },
  });

  return NextResponse.json({ marked: nodeIds.length });
}
