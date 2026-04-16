/**
 * The reconcile-all-wallets script overwrote wallets using CostEntry totals
 * but many charges only went to ApiUsage (not CostEntry). Restore the
 * manually-set correct balances.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  // Restore to Oren's real values (set earlier today)
  const fixes: Record<string, number> = {
    "fal.ai": 110.00,       // Oren's manual set
    "Google Gemini": 146.00, // $160 topped - $14 real spent
    "OpenAI": 134.80,        // $200 topped - $65.20 real spent
    // Higgsfield stays at $89.70 (correct)
  };
  for (const [name, avail] of Object.entries(fixes)) {
    const pr = await p.provider.findFirst({ where: { name: { contains: name, mode: "insensitive" } }, include: { wallet: true } });
    if (!pr?.wallet) continue;
    await p.creditWallet.update({ where: { id: pr.wallet.id }, data: { availableCredits: avail } });
    console.log(`${name}: restored to $${avail.toFixed(2)}`);
  }
  await p.$disconnect();
})();
