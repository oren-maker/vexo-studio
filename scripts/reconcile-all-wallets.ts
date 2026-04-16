import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const providers = await p.provider.findMany({ include: { wallet: true } });
  for (const pr of providers) {
    if (!pr.wallet) continue;
    const costs = await p.costEntry.aggregate({
      where: { providerId: pr.id },
      _sum: { totalCost: true },
      _count: true,
    });
    const spent = costs._sum.totalCost ?? 0;
    const topped = pr.wallet.totalCreditsAdded;
    const realAvail = Math.max(0, topped - spent);
    const diff = Math.abs(pr.wallet.availableCredits - realAvail);
    if (diff < 0.01) {
      console.log(`${pr.name}: ✓ OK · avail=$${pr.wallet.availableCredits.toFixed(2)} · spent=$${spent.toFixed(2)} · ${costs._count} entries`);
    } else {
      console.log(`${pr.name}: ⚡ FIX · was=$${pr.wallet.availableCredits.toFixed(2)} → now=$${realAvail.toFixed(2)} · spent=$${spent.toFixed(2)} · ${costs._count} entries`);
      await p.creditWallet.update({
        where: { id: pr.wallet.id },
        data: { availableCredits: realAvail },
      });
    }
  }
  await p.$disconnect();
})();
