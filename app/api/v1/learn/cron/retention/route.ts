// Memory retention — REPORT-ONLY mode.
//
// This cron originally pruned old BrainMessage content, deleted hourly
// InsightsSnapshot rows > 14 days, and deleted ActionOutcome rows > 180 days.
// Oren ruled (2026-04-22): never delete user data, never redact message
// bodies — every row stays forever. This cron now only REPORTS the tier
// distribution so the UI can still show "hot/passive/archive" counts, and
// flags old chats with summarizedAt so the UI can lazy-summarize on read.
// The destructive branches are kept as commented code below as a reminder
// of what NOT to do.

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

  // 1) Flag stale chats with summarizedAt (soft marker — no content changes).
  //    UI can lazy-summarize for display; original messages remain intact.
  const oldChats = await prisma.brainChat.findMany({
    where: { updatedAt: { lt: passiveCutoff }, summarizedAt: null },
    select: { id: true },
    take: 100,
  });
  for (const c of oldChats) {
    await prisma.brainChat.update({ where: { id: c.id }, data: { summarizedAt: now } });
  }

  // 2) Count-only reporting for the tier distribution card.
  const hotMessages = await prisma.brainMessage.count({ where: { createdAt: { gte: hotCutoff } } });
  const passiveMessages = await prisma.brainMessage.count({
    where: { createdAt: { lt: hotCutoff, gte: passiveCutoff } },
  });
  const archivedMessages = await prisma.brainMessage.count({ where: { createdAt: { lt: passiveCutoff } } });
  const insightsTotal = await prisma.insightsSnapshot.count();
  const actionOutcomes = await (prisma as any).actionOutcome?.count().catch(() => 0) ?? 0;

  return NextResponse.json({
    ok: true,
    mode: "report-only",
    policy: { hotDays: HOT_DAYS, passiveDays: PASSIVE_DAYS, deletionsDisabled: true },
    counts: {
      hotMessages,
      passiveMessages,
      archivedMessages,
      insightsTotal,
      actionOutcomes,
    },
    applied: {
      chatsFlaggedSummarized: oldChats.length,
      messagesRedacted: 0, // disabled
      insightsDeleted: 0, // disabled
      actionOutcomesDeleted: 0, // disabled
    },
    timestamp: now.toISOString(),
  });
}

export const POST = GET;
