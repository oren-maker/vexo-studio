import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

function checkAuth(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  return key && key === process.env.INTERNAL_API_KEY;
}

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const tags = (searchParams.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean);
  const limit = Math.min(50, Number(searchParams.get("limit") || 10));

  const subs = await prisma.subscriberPrompt.findMany({
    where: {
      userId: params.userId,
      ...(tags.length
        ? { source: { analysis: { is: { tags: { hasSome: tags } } } } }
        : {}),
    },
    include: { source: { include: { analysis: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    items: subs.map((s) => ({
      id: s.id,
      viewed: s.viewed,
      saved: s.saved,
      prompt: s.source.prompt,
      title: s.source.title,
      thumbnail: s.source.thumbnail,
      analysis: s.source.analysis
        ? {
            description: s.source.analysis.description,
            tags: s.source.analysis.tags,
            difficulty: s.source.analysis.difficulty,
          }
        : null,
    })),
  });
}
