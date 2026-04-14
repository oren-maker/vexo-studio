/**
 * Reconcile a provider's wallet against actual CostEntry totals.
 * availableCredits = totalCreditsAdded - sum(CostEntry totalCost where this provider was charged)
 * Useful when chargeUsd runs but the visible balance hasn't moved (e.g. Prisma
 * extension swallowing decrements, race conditions).
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_tokens"); if (f) return f;
    const provider = await prisma.provider.findFirst({ where: { id: params.id, organizationId: ctx.organizationId }, include: { wallet: true } });
    if (!provider) throw Object.assign(new Error("provider not found"), { statusCode: 404 });

    // Sum every CostEntry that was charged to this provider
    const entries = await prisma.costEntry.findMany({
      where: { providerId: provider.id },
      select: { totalCost: true },
    });
    const totalSpent = entries.reduce((s, e) => s + e.totalCost, 0);

    const wallet = await prisma.creditWallet.upsert({
      where: { providerId: provider.id },
      update: {},
      create: { providerId: provider.id, availableCredits: 0, totalCreditsAdded: 0, isTrackingEnabled: true },
    });
    const newAvailable = +(wallet.totalCreditsAdded - totalSpent).toFixed(6);
    await prisma.creditWallet.update({
      where: { id: wallet.id },
      data: { availableCredits: newAvailable },
    });
    await prisma.creditTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: "ADD",
        amount: 0,
        unitType: "USD",
        sourceType: "MANUAL",
        description: `Reconciled · totalAdded $${wallet.totalCreditsAdded.toFixed(4)} − spent $${totalSpent.toFixed(4)} = available $${newAvailable.toFixed(4)} (${entries.length} entries)`,
        createdByUserId: ctx.user.id,
      },
    });

    return ok({
      providerId: provider.id,
      providerName: provider.name,
      totalAdded: wallet.totalCreditsAdded,
      totalSpent: +totalSpent.toFixed(6),
      newAvailable,
      entryCount: entries.length,
    });
  } catch (e) { return handleError(e); }
}
