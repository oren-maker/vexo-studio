import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

// Vercel Cron hits this every minute (see vercel.json)
export async function GET(req: NextRequest) {
  // Auth: Vercel Cron includes `Authorization: Bearer <CRON_SECRET>` when set in env
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let scheduledPublished = 0;
  let calendarPublished = 0;

  // 1. Episodes with scheduledPublishAt in the past → publish
  const due = await prisma.episode.findMany({
    where: { scheduledPublishAt: { lte: now, not: null }, publishedAt: null },
    select: { id: true, title: true },
  });
  for (const ep of due) {
    await prisma.episode.update({ where: { id: ep.id }, data: { status: "PUBLISHED", publishedAt: now } });
    scheduledPublished++;
  }

  // 2. Calendar entries with scheduledAt in the past → mark published
  const calEntries = await prisma.contentCalendarEntry.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
  });
  for (const e of calEntries) {
    if (e.episodeId) {
      await prisma.episode.updateMany({ where: { id: e.episodeId, publishedAt: null }, data: { status: "PUBLISHED", publishedAt: now } });
    }
    await prisma.contentCalendarEntry.update({ where: { id: e.id }, data: { status: "PUBLISHED", publishedAt: now } });
    calendarPublished++;
  }

  // 3. Auto-sync provider wallets (fal.ai for now)
  let walletsSynced = 0;
  try {
    const { fetchBalance } = await import("@/lib/providers/fal");
    const falProviders = await prisma.provider.findMany({ where: { isActive: true, name: { contains: "fal", mode: "insensitive" } } });
    for (const p of falProviders) {
      try {
        const b = await fetchBalance();
        await prisma.creditWallet.upsert({
          where: { providerId: p.id },
          update: { availableCredits: b.currentBalance ?? 0 },
          create: { providerId: p.id, availableCredits: b.currentBalance ?? 0, totalCreditsAdded: b.currentBalance ?? 0, isTrackingEnabled: true },
        });
        walletsSynced++;
      } catch { /* ignore single-provider failures */ }
    }
  } catch { /* fal lib not configured */ }

  return NextResponse.json({ ok: true, tick: now.toISOString(), scheduledPublished, calendarPublished, walletsSynced });
}
