// One-shot: set the real provider wallet balances per Oren's input.
//   Google Gemini: $146 remaining (started at $160 → $14 spent)
//   OpenAI:        $50.80 remaining ($100 topped up, $49.20 spent)
//
// We also reconcile totalCreditsAdded so the UI math (capacity = available + spent)
// shows the right "API topups" hint instead of falling back to "initial seed".

import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

type Target = { providerNamePattern: string; available: number; toppedUp: number; spent: number };

const TARGETS: Target[] = [
  { providerNamePattern: "gemini", available: 146.0, toppedUp: 160.0, spent: 14.0 },
  { providerNamePattern: "openai", available: 50.80, toppedUp: 100.0, spent: 49.20 },
];

(async () => {
  for (const t of TARGETS) {
    const provider = await p.provider.findFirst({
      where: { name: { contains: t.providerNamePattern, mode: "insensitive" } },
      include: { wallet: true },
    });
    if (!provider) {
      console.log(`[skip] no provider matches "${t.providerNamePattern}"`);
      continue;
    }
    let walletId = provider.wallet?.id;
    if (!walletId) {
      const w = await p.creditWallet.create({
        data: {
          providerId: provider.id,
          availableCredits: t.available,
          totalCreditsAdded: t.toppedUp,
          reservedCredits: 0,
          isTrackingEnabled: true,
        },
      });
      walletId = w.id;
      console.log(`[create wallet] ${provider.name} → wallet ${walletId}`);
    } else {
      await p.creditWallet.update({
        where: { id: walletId },
        data: {
          availableCredits: t.available,
          totalCreditsAdded: t.toppedUp,
        },
      });
      console.log(`[update wallet] ${provider.name}: avail=$${t.available} · topped=$${t.toppedUp}`);
    }
    // Add an audit transaction so the change shows up in the wallet history.
    await p.creditTransaction.create({
      data: {
        walletId,
        transactionType: "ADJUSTMENT",
        amount: t.available,
        unitType: "USD",
        sourceType: "MANUAL",
        description: `Manual reconcile by Oren — real balance from provider dashboard ($${t.available} remaining, $${t.spent} spent of $${t.toppedUp})`,
      },
    });
  }

  // Print final state
  const all = await p.provider.findMany({ include: { wallet: true } });
  console.log(`\n=== Final wallet state ===`);
  for (const pr of all) {
    if (!pr.wallet) continue;
    console.log(`${pr.name}: avail=$${pr.wallet.availableCredits.toFixed(2)} · topped=$${pr.wallet.totalCreditsAdded.toFixed(2)}`);
  }
  await p.$disconnect();
})();
