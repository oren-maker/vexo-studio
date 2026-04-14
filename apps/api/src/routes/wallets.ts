import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vexo/db";
import { CreateWalletSchema, WalletAdjustmentSchema } from "@vexo/shared";

async function assertProviderInOrg(providerId: string, orgId?: string) {
  const provider = await prisma.provider.findFirst({ where: { id: providerId, organizationId: orgId } });
  if (!provider) throw new Error("provider not in org");
  return provider;
}

async function assertWalletInOrg(walletId: string, orgId?: string) {
  const wallet = await prisma.creditWallet.findFirst({
    where: { id: walletId, provider: { organizationId: orgId } },
  });
  if (!wallet) throw new Error("wallet not in org");
  return wallet;
}

export const walletRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.requirePermission("manage_tokens")] }, async (req) =>
    prisma.creditWallet.findMany({
      where: { provider: { organizationId: req.organizationId } },
      include: { provider: true },
    }),
  );

  app.post("/", { preHandler: [app.requirePermission("manage_tokens")] }, async (req, reply) => {
    const body = CreateWalletSchema.parse(req.body);
    await assertProviderInOrg(body.providerId, req.organizationId);
    const wallet = await prisma.creditWallet.create({
      data: {
        providerId: body.providerId,
        totalCreditsAdded: body.initialCredits,
        availableCredits: body.initialCredits,
        lowBalanceThreshold: body.lowBalanceThreshold,
        criticalBalanceThreshold: body.criticalBalanceThreshold,
        isTrackingEnabled: body.isTrackingEnabled,
        notes: body.notes,
      },
    });
    reply.code(201);
    return wallet;
  });

  app.post<{ Params: { id: string } }>(
    "/:id/add",
    { preHandler: [app.requirePermission("manage_tokens")] },
    async (req) => {
      await assertWalletInOrg(req.params.id, req.organizationId);
      const body = WalletAdjustmentSchema.parse(req.body);
      return prisma.$transaction(async (tx) => {
        const w = await tx.creditWallet.update({
          where: { id: req.params.id },
          data: {
            availableCredits: { increment: body.amount },
            totalCreditsAdded: { increment: body.amount },
          },
        });
        await tx.creditTransaction.create({
          data: {
            walletId: w.id,
            transactionType: "ADD",
            amount: body.amount,
            unitType: body.unitType,
            sourceType: "MANUAL",
            description: body.description,
            createdByUserId: req.currentUser?.id,
            referenceId: body.referenceId,
          },
        });
        return w;
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/:id/reduce",
    { preHandler: [app.requirePermission("manage_tokens")] },
    async (req) => {
      await assertWalletInOrg(req.params.id, req.organizationId);
      const body = WalletAdjustmentSchema.parse(req.body);
      return prisma.$transaction(async (tx) => {
        const w = await tx.creditWallet.update({
          where: { id: req.params.id },
          data: { availableCredits: { decrement: body.amount } },
        });
        await tx.creditTransaction.create({
          data: {
            walletId: w.id,
            transactionType: "DEDUCT",
            amount: body.amount,
            unitType: body.unitType,
            sourceType: "MANUAL",
            description: body.description,
            createdByUserId: req.currentUser?.id,
            referenceId: body.referenceId,
          },
        });
        return w;
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/:id/transactions",
    { preHandler: [app.requirePermission("manage_tokens")] },
    async (req) => {
      await assertWalletInOrg(req.params.id, req.organizationId);
      return prisma.creditTransaction.findMany({
        where: { walletId: req.params.id },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
    },
  );
};
