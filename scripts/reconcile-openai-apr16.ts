/**
 * Oren reconcile (2026-04-16):
 *   OpenAI — real spend $65.20, fresh $100 top-up (on top of the prior $100).
 *   Target: availableCredits=$134.80, totalCreditsAdded=$200, auditable history.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const TOP_UP_USD = 100.00;
const TOTAL_TOPPED = 200.00; // $100 prior + $100 now
const REAL_SPENT = 65.20;
const REAL_AVAIL = TOTAL_TOPPED - REAL_SPENT; // 134.80

(async () => {
  const openai = await p.provider.findFirst({
    where: { name: { contains: "openai", mode: "insensitive" } },
    include: { wallet: true },
  });
  if (!openai) { console.error("no OpenAI provider"); process.exit(1); }

  let walletId = openai.wallet?.id;
  if (!walletId) {
    const w = await p.creditWallet.create({
      data: {
        providerId: openai.id,
        availableCredits: REAL_AVAIL,
        totalCreditsAdded: TOTAL_TOPPED,
        reservedCredits: 0,
        isTrackingEnabled: true,
      },
    });
    walletId = w.id;
    console.log(`[created] wallet ${walletId}`);
  } else {
    console.log(`[before] avail=$${openai.wallet!.availableCredits.toFixed(2)} · topped=$${openai.wallet!.totalCreditsAdded.toFixed(2)}`);
    await p.creditWallet.update({
      where: { id: walletId },
      data: {
        availableCredits: REAL_AVAIL,
        totalCreditsAdded: TOTAL_TOPPED,
      },
    });
  }

  // Record the top-up as a transaction so history is auditable.
  await p.creditTransaction.create({
    data: {
      walletId,
      transactionType: "CREDIT",
      amount: TOP_UP_USD,
      unitType: "USD",
      sourceType: "MANUAL",
      description: `Oren top-up — additional $${TOP_UP_USD.toFixed(2)} added to OpenAI (total lifetime topped: $${TOTAL_TOPPED.toFixed(2)})`,
    },
  });
  // And a reconciliation marker so the running tally matches real dashboard.
  await p.creditTransaction.create({
    data: {
      walletId,
      transactionType: "ADJUSTMENT",
      amount: REAL_AVAIL,
      unitType: "USD",
      sourceType: "MANUAL",
      description: `Reconcile to real OpenAI dashboard: $${REAL_AVAIL.toFixed(2)} remaining, $${REAL_SPENT.toFixed(2)} spent of $${TOTAL_TOPPED.toFixed(2)} lifetime top-ups.`,
    },
  });

  // Cross-check: total ApiUsage recorded for OpenAI engines
  const openaiUsage = await p.apiUsage.aggregate({
    _sum: { usdCost: true },
    _count: true,
    where: {
      meta: { path: ["engine"], string_contains: "openai" } as any,
    },
  });
  const tracked = openaiUsage._sum.usdCost ?? 0;
  const untracked = REAL_SPENT - tracked;

  const after = await p.provider.findFirst({
    where: { id: openai.id }, include: { wallet: true },
  });
  console.log(`\n[after]  avail=$${after!.wallet!.availableCredits.toFixed(2)} · topped=$${after!.wallet!.totalCreditsAdded.toFixed(2)}`);
  console.log(`\nApiUsage tracked for OpenAI: $${tracked.toFixed(2)} across ${openaiUsage._count} rows`);
  console.log(`Real spent on dashboard:     $${REAL_SPENT.toFixed(2)}`);
  console.log(`Δ untracked:                 $${untracked.toFixed(2)} (Sora/GPT usage not logged through vexo-studio)`);
  console.log(`\nMath check: ${REAL_AVAIL.toFixed(2)} + ${REAL_SPENT.toFixed(2)} = ${(REAL_AVAIL + REAL_SPENT).toFixed(2)} (should be ${TOTAL_TOPPED.toFixed(2)}) ✓`);
  await p.$disconnect();
})();
