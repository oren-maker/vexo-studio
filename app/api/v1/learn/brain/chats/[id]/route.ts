import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const chat = await prisma.brainChat.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ chat });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  // Soft-delete: set archivedAt, keep every message body intact.
  // Listing queries in /learn/brain/chat/logs filter out archivedAt != null.
  // See memory: feedback_never_delete_always_persist.
  await prisma.brainChat.update({
    where: { id: params.id },
    data: { archivedAt: new Date() },
  });
  return NextResponse.json({ ok: true, archived: true });
}
