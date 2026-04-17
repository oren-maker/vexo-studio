/**
 * Final reconciliation based on Oren's real Higgsfield dashboard:
 * Kling 3.0: 8 calls × $4.11 avg = $32.88
 * Seedance 1.5: 7 calls × $0.56 avg = $3.94
 * Soul Character: 5 × $0.06 = $0.31
 * Soul Standard: 5 × $0.06 = $0.31
 * Soul Reference: 1 × $0.06 = $0.06
 * TOTAL Higgsfield: $37.50
 *
 * Also: OpenAI Sora direct calls from scripts (~5 extra jobs = $10)
 * Also: EP01 rebuild Gemini/Groq calls (~30 calls × $0.003 = $0.09)
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  // 1. Higgsfield wallet: real spend = $37.50
  const higgs = await p.provider.findFirst({
    where: { name: { contains: "Higgsfield", mode: "insensitive" } },
    include: { wallet: true },
  });
  if (higgs?.wallet) {
    const realSpent = 37.50;
    const newAvail = 100.00 - realSpent;
    await p.creditWallet.update({
      where: { id: higgs.wallet.id },
      data: { availableCredits: newAvail },
    });
    await p.creditTransaction.create({
      data: {
        walletId: higgs.wallet.id,
        transactionType: "ADJUSTMENT",
        amount: newAvail,
        unitType: "USD",
        sourceType: "MANUAL",
        description: `Reconcile to real Higgsfield dashboard: $${realSpent.toFixed(2)} spent (Kling $32.88 + Seedance $3.94 + Soul $0.68)`,
      },
    });
    console.log(`Higgsfield: $${higgs.wallet.availableCredits.toFixed(2)} → $${newAvail.toFixed(2)} (spent $${realSpent.toFixed(2)})`);
  }

  // 2. OpenAI wallet: add ~$10 for Sora direct script calls
  // Previous: $134.80 avail, $65.20 spent of $200
  // Extra Sora jobs from scripts: ~5 × $2 = $10
  const openai = await p.provider.findFirst({
    where: { name: { contains: "OpenAI", mode: "insensitive" } },
    include: { wallet: true },
  });
  if (openai?.wallet) {
    const extraSoraSpend = 10.00;
    const newAvail = openai.wallet.availableCredits - extraSoraSpend;
    await p.creditWallet.update({
      where: { id: openai.wallet.id },
      data: { availableCredits: Math.max(0, newAvail) },
    });
    await p.creditTransaction.create({
      data: {
        walletId: openai.wallet.id,
        transactionType: "DEDUCT",
        amount: extraSoraSpend,
        unitType: "USD",
        sourceType: "MANUAL",
        description: "Sora direct script calls (~5 jobs × $2) outside vexo-studio UI",
      },
    });
    console.log(`OpenAI: $${openai.wallet.availableCredits.toFixed(2)} → $${newAvail.toFixed(2)} (extra $${extraSoraSpend})`);
  }

  // 3. Google Gemini: EP01 rebuild + brain chats + various Gemini calls
  // ~40 Groq/Gemini calls × $0.003 = ~$0.12
  const gemini = await p.provider.findFirst({
    where: { name: { contains: "Gemini", mode: "insensitive" } },
    include: { wallet: true },
  });
  if (gemini?.wallet) {
    const extraGeminiSpend = 0.15;
    const newAvail = gemini.wallet.availableCredits - extraGeminiSpend;
    await p.creditWallet.update({
      where: { id: gemini.wallet.id },
      data: { availableCredits: Math.max(0, newAvail) },
    });
    console.log(`Gemini: $${gemini.wallet.availableCredits.toFixed(2)} → $${newAvail.toFixed(2)} (extra $${extraGeminiSpend})`);
  }

  // Print final state
  const all = await p.provider.findMany({ include: { wallet: true } });
  console.log("\n=== FINAL WALLETS ===");
  for (const pr of all) {
    if (!pr.wallet) continue;
    const spent = pr.wallet.totalCreditsAdded - pr.wallet.availableCredits;
    console.log(`${pr.name}: $${pr.wallet.availableCredits.toFixed(2)} avail · $${spent.toFixed(2)} spent · $${pr.wallet.totalCreditsAdded.toFixed(2)} topped`);
  }
  await p.$disconnect();
})();
