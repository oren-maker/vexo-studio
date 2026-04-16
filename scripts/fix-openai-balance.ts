// Restore OpenAI wallet availableCredits to $50.80 (the real remaining
// per Oren's dashboard). The reconcile script accidentally decremented
// it by $49.20, but availableCredits was ALREADY net of that spend.

import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  const openai = await p.provider.findFirst({
    where: { name: { contains: "openai", mode: "insensitive" } },
    include: { wallet: true },
  });
  if (!openai?.wallet) { console.log("no wallet"); return; }
  await p.creditWallet.update({
    where: { id: openai.wallet.id },
    data: { availableCredits: 50.80 },
  });
  console.log(`OpenAI wallet → availableCredits=$50.80`);
  await p.$disconnect();
})();
