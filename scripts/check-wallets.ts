import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const providers = await p.provider.findMany({ include: { wallet: true } });
  for (const pr of providers) {
    console.log(`${pr.name}: wallet=${pr.wallet ? `$${pr.wallet.availableCredits.toFixed(2)} avail / $${pr.wallet.totalCreditsAdded.toFixed(2)} topped` : "NO WALLET"}`);
  }
  await p.$disconnect();
})();
