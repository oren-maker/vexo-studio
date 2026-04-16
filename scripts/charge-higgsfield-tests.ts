/**
 * Charge the Higgsfield wallet for all test videos I generated via scripts.
 * These bypassed the normal generate-video flow so no CostEntry/wallet
 * deduction happened automatically.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const provider = await p.provider.findFirst({
    where: { name: { contains: "Higgsfield", mode: "insensitive" } },
    include: { wallet: true },
  });
  if (!provider?.wallet) { console.error("no Higgsfield wallet"); process.exit(1); }
  console.log(`Before: $${provider.wallet.availableCredits.toFixed(2)}`);

  // All completed/queued test generations:
  const charges = [
    // Batch 1 (original prompt)
    { desc: "Kling 3.0 t2v 15s (test batch 1)", dur: 15, rate: 0.06 },
    { desc: "Seedance 1.5 t2v 12s (test batch 1)", dur: 12, rate: 0.05 },
    { desc: "Soul Character 60s (test batch 1)", dur: 60, rate: 0.05 },
    { desc: "Soul Standard 60s (test batch 1, queued)", dur: 60, rate: 0.05 },
    // Batch 2 (fixed prompt)
    { desc: "Kling 3.0 t2v 15s (test batch 2)", dur: 15, rate: 0.06 },
    { desc: "Seedance 1.5 t2v 12s (test batch 2)", dur: 12, rate: 0.05 },
    // Short probes (mostly cancelled but some may have charged)
    { desc: "Kling 3.0 t2v 5s (probe)", dur: 5, rate: 0.06 },
    { desc: "Soul Standard 5s (probe)", dur: 5, rate: 0.05 },
    { desc: "Soul Reference 5s (probe)", dur: 5, rate: 0.05 },
    { desc: "Soul Character 5s (probe)", dur: 5, rate: 0.05 },
    { desc: "Seedance 1.5 5s (probe)", dur: 5, rate: 0.05 },
  ];

  let totalCharged = 0;
  for (const c of charges) {
    const cost = +(c.dur * c.rate).toFixed(4);
    totalCharged += cost;
    // CostEntry
    await p.costEntry.create({
      data: {
        entityType: "SCENE", entityId: "test-script",
        costCategory: "GENERATION",
        description: c.desc,
        unitCost: cost, quantity: 1, totalCost: cost,
        sourceType: "BACKFILL",
        providerId: provider.id,
      },
    });
    // CreditTransaction
    await p.creditTransaction.create({
      data: {
        walletId: provider.wallet.id,
        transactionType: "DEDUCT",
        amount: cost,
        unitType: "USD",
        sourceType: "JOB",
        description: c.desc,
      },
    });
    console.log(`  $${cost.toFixed(2)} · ${c.desc}`);
  }

  // Deduct from wallet
  await p.creditWallet.update({
    where: { id: provider.wallet.id },
    data: { availableCredits: { decrement: totalCharged } },
  });

  const after = await p.creditWallet.findUnique({ where: { id: provider.wallet.id } });
  console.log(`\nTotal charged: $${totalCharged.toFixed(2)}`);
  console.log(`After: $${after!.availableCredits.toFixed(2)}`);
  await p.$disconnect();
})();
