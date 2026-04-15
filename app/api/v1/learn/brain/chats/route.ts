import { NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const chats = await prisma.brainChat.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { _count: { select: { messages: true } } },
  });
  return NextResponse.json({ chats });
}
