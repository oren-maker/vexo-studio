import { prisma } from "./prisma";

/**
 * Records a cost entry + deducts it from the provider's wallet (USD).
 * Pass usd = 0 for free operations (still logged as 0).
 */
// Providers we auto-create on first charge so usage is tracked + visible
// in the wallets page even before the user manually configures them.
const AUTO_CREATE_PROVIDERS: Record<string, { category: string; apiUrl?: string }> = {
  "Google Gemini": { category: "TEXT",  apiUrl: "https://generativelanguage.googleapis.com" },
  "fal.ai":        { category: "VIDEO", apiUrl: "https://fal.run" },
  "OpenAI":        { category: "VIDEO", apiUrl: "https://api.openai.com" },
};

export async function chargeUsd(opts: {
  organizationId: string;
  projectId?: string | null;
  entityType: string;        // "FRAME" | "SCENE" | "EPISODE" | …
  entityId: string;
  providerName: string;      // e.g. "fal.ai"
  category: "GENERATION" | "TOKEN" | "STORAGE" | "SERVER" | "MANUAL";
  description: string;
  unitCost: number;          // USD per unit
  quantity?: number;
  userId?: string | null;
  meta?: Record<string, unknown>;
}) {
  const qty = opts.quantity ?? 1;
  const total = +(opts.unitCost * qty).toFixed(6);

  // Pull provider + wallet in one round-trip — was previously a second
  // findUnique on the wallet inside this same call.
  let provider = await prisma.provider.findFirst({
    where: { organizationId: opts.organizationId, name: opts.providerName },
    include: { wallet: true },
  });
  if (!provider && AUTO_CREATE_PROVIDERS[opts.providerName]) {
    const cfg = AUTO_CREATE_PROVIDERS[opts.providerName];
    try {
      provider = await prisma.provider.create({
        data: {
          organizationId: opts.organizationId,
          name: opts.providerName,
          category: cfg.category,
          apiUrl: cfg.apiUrl,
          isActive: true,
          wallet: { create: { availableCredits: 0, totalCreditsAdded: 0, isTrackingEnabled: true } },
        },
        include: { wallet: true },
      });
    } catch { /* race — re-fetch */
      provider = await prisma.provider.findFirst({
        where: { organizationId: opts.organizationId, name: opts.providerName },
        include: { wallet: true },
      });
    }
  }
  const providerId = provider?.id;
  const wallet = provider?.wallet;

  // Cost entry + wallet deduction can run in parallel — they touch
  // different rows and neither blocks the other.
  const writes: Promise<unknown>[] = [
    prisma.costEntry.create({
      data: {
        projectId: opts.projectId ?? undefined,
        entityType: opts.entityType, entityId: opts.entityId,
        costCategory: opts.category,
        providerId,
        description: opts.description,
        unitCost: opts.unitCost, quantity: qty, totalCost: total,
        sourceType: "JOB",
        createdByUserId: opts.userId ?? undefined,
      },
    }),
  ];
  if (wallet && total > 0) {
    writes.push(prisma.$transaction([
      prisma.creditWallet.update({ where: { id: wallet.id }, data: { availableCredits: { decrement: total } } }),
      prisma.creditTransaction.create({
        data: {
          walletId: wallet.id, transactionType: "DEDUCT", amount: total, unitType: "USD",
          sourceType: "JOB", description: opts.description, referenceId: opts.entityId,
          createdByUserId: opts.userId ?? undefined,
        },
      }),
    ]));
  }
  await Promise.all(writes);

  return { totalCost: total, providerId };
}
