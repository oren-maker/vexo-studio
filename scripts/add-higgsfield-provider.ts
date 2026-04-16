import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const org = await p.organization.findFirst();
  if (!org) { console.error("no org"); process.exit(1); }
  console.log(`org: ${org.id}`);
  let prov = await p.provider.findFirst({ where: { name: { contains: "higgsfield", mode: "insensitive" } } });
  if (!prov) {
    prov = await p.provider.create({
      data: { name: "Higgsfield", category: "VIDEO", isActive: true, apiUrl: "https://platform.higgsfield.ai", notes: "Cinema Studio video gen (DOP, Seedance, Kling) — image-to-video only", organizationId: org.id },
    });
    console.log(`✓ provider created: ${prov.id}`);
  } else {
    console.log(`✓ provider exists: ${prov.id}`);
  }
  let wallet = await p.creditWallet.findFirst({ where: { providerId: prov.id } });
  if (!wallet) {
    wallet = await p.creditWallet.create({
      data: { providerId: prov.id, availableCredits: 100, totalCreditsAdded: 100, reservedCredits: 0, isTrackingEnabled: true },
    });
    console.log(`✓ wallet: $${wallet.availableCredits}`);
  } else { console.log(`✓ wallet exists: $${wallet.availableCredits}`); }
  await p.creditTransaction.create({
    data: { walletId: wallet.id, transactionType: "CREDIT", amount: 100, unitType: "USD", sourceType: "MANUAL", description: "Initial $100 top-up Higgsfield Cloud API" },
  });
  console.log(`✅ Done.`);
  await p.$disconnect();
})();
