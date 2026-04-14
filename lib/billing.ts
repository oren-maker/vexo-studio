import { prisma } from "./prisma";

/**
 * Records a cost entry + deducts it from the provider's wallet (USD).
 * Pass usd = 0 for free operations (still logged as 0).
 */
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

  const provider = await prisma.provider.findFirst({ where: { organizationId: opts.organizationId, name: opts.providerName } });
  const providerId = provider?.id;

  await prisma.costEntry.create({
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
  });

  // Deduct wallet (if exists). USD-only.
  if (providerId && total > 0) {
    const wallet = await prisma.creditWallet.findUnique({ where: { providerId } });
    if (wallet) {
      await prisma.$transaction([
        prisma.creditWallet.update({ where: { id: wallet.id }, data: { availableCredits: { decrement: total } } }),
        prisma.creditTransaction.create({
          data: {
            walletId: wallet.id, transactionType: "DEDUCT", amount: total, unitType: "USD",
            sourceType: "JOB", description: opts.description, referenceId: opts.entityId,
            createdByUserId: opts.userId ?? undefined,
          },
        }),
      ]);
    }
  }

  return { totalCost: total, providerId };
}
