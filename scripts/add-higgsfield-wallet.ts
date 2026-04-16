/**
 * Add Higgsfield as a provider + wallet with $100 initial balance.
 * Also check if Higgsfield API has a balance endpoint.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  // 1. Create provider if not exists
  let provider = await p.provider.findFirst({ where: { name: { contains: "higgsfield", mode: "insensitive" } } });
  if (!provider) {
    provider = await p.provider.create({
      data: {
        name: "Higgsfield",
        type: "VIDEO",
        isActive: true,
        apiEndpoint: "https://api.higgsfield.ai/v1",
        description: "Cinema Studio video generation (Seedance 2, Kling 3, Wan 2.5)",
        category: "VIDEO",
      },
    });
    console.log(`✓ Created provider: ${provider.id} · ${provider.name}`);
  } else {
    console.log(`✓ Provider exists: ${provider.id} · ${provider.name}`);
  }

  // 2. Create or update wallet
  let wallet = await p.creditWallet.findFirst({ where: { providerId: provider.id } });
  if (!wallet) {
    wallet = await p.creditWallet.create({
      data: {
        providerId: provider.id,
        availableCredits: 100.00,
        totalCreditsAdded: 100.00,
        reservedCredits: 0,
        isTrackingEnabled: true,
      },
    });
    console.log(`✓ Created wallet: $${wallet.availableCredits}`);
  } else {
    await p.creditWallet.update({
      where: { id: wallet.id },
      data: { availableCredits: 100.00, totalCreditsAdded: 100.00 },
    });
    console.log(`✓ Updated wallet: $100.00`);
  }

  // 3. Audit transaction
  await p.creditTransaction.create({
    data: {
      walletId: wallet.id,
      transactionType: "CREDIT",
      amount: 100.00,
      unitType: "USD",
      sourceType: "MANUAL",
      description: "Initial $100 top-up for Higgsfield Cloud API",
    },
  });
  console.log(`✓ Audit transaction logged`);

  // 4. Try checking balance via API
  const apiKey = process.env.HIGGSFIELD_API_KEY || "80567f1f8feaf739754d3c122ded287ac791acb9f5164514d9b0ec091480fa2a";
  console.log(`\nChecking Higgsfield balance API...`);
  for (const path of ["/account/balance", "/billing/balance", "/credits", "/account", "/user/me"]) {
    try {
      const res = await fetch(`https://api.higgsfield.ai/v1${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      console.log(`  ${path}: ${res.status} ${text.slice(0, 200)}`);
      if (res.ok) console.log(`  ✅ Found balance endpoint!`);
    } catch (e: any) {
      console.log(`  ${path}: error ${e.message}`);
    }
  }

  console.log(`\n✅ Done.`);
  await p.$disconnect();
})();
