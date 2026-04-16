// Memory retention policy — applies the TTL rules from section 10 of the
// system-docs page:
//   hot    = per-turn (BrainMessage in active chats, <30 days): untouched
//   passive = indefinite-but-redactable (BrainChat over 90 days): summarized
//   archive = immutable (everything else): left alone
//
// Runs nightly (add to vercel.json crons).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const HOT_DAYS = 30;
const PASSIVE_DAYS = 90;

export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const now = new Date();
  const hotCutoff = new Date(now.getTime() - HOT_DAYS * 24 * 60 * 60 * 1000);
  const passiveCutoff = new Date(now.getTime() - PASSIVE_DAYS * 24 * 60 * 60 * 1000);

  // 1) Identify chats that haven't been touched since passiveCutoff
  //    → mark as summarizedAt (field already exists) + prune long message bodies
  const oldChats = await prisma.brainChat.findMany({
    where: {
      updatedAt: { lt: passiveCutoff },
      summarizedAt: null,
    },
    include: {
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, content: true, role: true } },
    },
    take: 50, // bounded per run
  });

  let summarized = 0;
  let messagesRedacted = 0;
  for (const chat of oldChats) {
    // Summarise: keep first+last 3 messages in full, replace middle with [... N messages archived ...]
    if (chat.messages.length > 8) {
      const keepFirst = chat.messages.slice(0, 3);
      const keepLast = chat.messages.slice(-3);
      const middle = chat.messages.slice(3, -3);
      // Redact middle by shortening content
      await prisma.$transaction(
        middle.map((m) =>
          prisma.brainMessage.update({
            where: { id: m.id },
            data: {
              content: `[archived ${m.createdAt?.toISOString?.().slice(0, 10) ?? ""}] ${String(m.content).slice(0, 120)}…`,
            },
          })
        )
      );
      messagesRedacted += middle.length;
    }
    await prisma.brainChat.update({
      where: { id: chat.id },
      data: { summarizedAt: now },
    });
    summarized++;
  }

  // 2) Count hot-tier activity for the report
  const hotMessages = await prisma.brainMessage.count({ where: { createdAt: { gte: hotCutoff } } });
  const passiveMessages = await prisma.brainMessage.count({
    where: { createdAt: { lt: hotCutoff, gte: passiveCutoff } },
  });
  const archivedMessages = await prisma.brainMessage.count({ where: { createdAt: { lt: passiveCutoff } } });

  return NextResponse.json({
    ok: true,
    policy: { hotDays: HOT_DAYS, passiveDays: PASSIVE_DAYS },
    counts: {
      hotMessages,
      passiveMessages,
      archivedMessages,
    },
    applied: {
      chatsSummarized: summarized,
      messagesRedacted,
    },
    timestamp: now.toISOString(),
  });
}

export const POST = GET;
