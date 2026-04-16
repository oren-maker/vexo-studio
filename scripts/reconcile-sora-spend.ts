// Bring OpenAI Sora spend (~$49.20 per Oren's dashboard) into both:
//   1. CreditWallet/CreditTransaction → so /admin/wallets "ספקים בוזבז" matches
//   2. ApiUsage → so /learn/tokens engine breakdown shows "openai-video"
// Idempotent: re-running won't double-count (computes the gap and only adds the diff).

import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const TARGET_OPENAI_SPENT = 49.20;
// Average historic Sora gen we're representing = sora-2 8s = $0.80 each
const ASSUMED_PER_VIDEO = 0.80;

(async () => {
  // --- 1. CreditWallet side ---
  const openai = await p.provider.findFirst({
    where: { name: { contains: "openai", mode: "insensitive" } },
    include: { wallet: { include: { transactions: true } } },
  });
  if (!openai?.wallet) {
    console.log("[skip] no OpenAI wallet found");
  } else {
    const txs = openai.wallet.transactions;
    const usageSum = txs.filter((t) => t.transactionType === "USAGE").reduce((s, t) => s + t.amount, 0);
    const gap = +(TARGET_OPENAI_SPENT - usageSum).toFixed(4);
    if (gap > 0.01) {
      // Insert ONE catch-up USAGE transaction representing pre-existing Sora spend.
      await p.creditTransaction.create({
        data: {
          walletId: openai.wallet.id,
          transactionType: "USAGE",
          amount: gap,
          unitType: "USD",
          sourceType: "MANUAL",
          description: `Catch-up: historic Sora 2 video generation prior to ApiUsage tracking ($${gap.toFixed(2)})`,
        },
      });
      // Also reduce availableCredits by the gap so the wallet equation balances.
      await p.creditWallet.update({
        where: { id: openai.wallet.id },
        data: { availableCredits: { decrement: gap } },
      });
      console.log(`[wallet] added USAGE $${gap.toFixed(2)} → totalSpent now $${(usageSum + gap).toFixed(2)}`);
    } else {
      console.log(`[wallet] OpenAI USAGE already $${usageSum.toFixed(2)} — within $0.01 of target, skipping`);
    }
  }

  // --- 2. ApiUsage side ---
  const apiUsageSum = await p.apiUsage.aggregate({
    where: { engine: "openai-video" },
    _sum: { usdCost: true },
  });
  const apiSum = apiUsageSum._sum.usdCost ?? 0;
  const apiGap = +(TARGET_OPENAI_SPENT - apiSum).toFixed(4);
  if (apiGap > 0.01) {
    // Create N synthetic rows (~$0.80 each = sora-2 8s) so the breakdown
    // shows realistic call counts, not one giant row.
    const n = Math.max(1, Math.round(apiGap / ASSUMED_PER_VIDEO));
    const perRow = +(apiGap / n).toFixed(4);
    const sec = Math.round(perRow / 0.10); // sora-2 = $0.10/sec
    const rows = Array.from({ length: n }).map((_, i) => ({
      engine: "openai-video",
      model: "sora-2",
      operation: "video-gen",
      inputTokens: 0,
      outputTokens: 0,
      imagesOut: 0,
      videoSeconds: sec,
      usdCost: perRow,
      sourceId: null,
      errored: false,
      meta: {
        engine: "openai-sora",
        seconds: String(sec),
        title: `Historic Sora video #${i + 1}`,
        purpose: "scene-video",
        backfill: true,
      } as any,
    }));
    await p.apiUsage.createMany({ data: rows });
    console.log(`[ApiUsage] inserted ${n} sora-2 rows · ${sec}s each · $${perRow} each = $${apiGap.toFixed(2)} total`);
  } else {
    console.log(`[ApiUsage] openai-video already at $${apiSum.toFixed(4)} — skipping`);
  }

  await p.$disconnect();
})();
