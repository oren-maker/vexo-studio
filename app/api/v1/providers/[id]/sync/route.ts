/**
 * Sync provider wallet balance from upstream API.
 * Currently supports fal.ai. Extend with switch by provider.name.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { fetchBalance } from "@/lib/providers/fal";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_tokens"); if (f) return f;
    const provider = await prisma.provider.findFirst({ where: { id: params.id, organizationId: ctx.organizationId }, include: { wallet: true } });
    if (!provider) throw Object.assign(new Error("provider not found"), { statusCode: 404 });

    const name = provider.name.toLowerCase();
    if (name.includes("fal")) {
      const b = await fetchBalance();
      const current = b.currentBalance ?? 0;
      // Upsert wallet
      const wallet = await prisma.creditWallet.upsert({
        where: { providerId: provider.id },
        update: { availableCredits: current, isTrackingEnabled: true },
        create: { providerId: provider.id, availableCredits: current, totalCreditsAdded: current, isTrackingEnabled: true },
      });
      // Reconcile transaction: log a SYNC entry so history shows what was reset
      await prisma.creditTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: "ADD",
          amount: 0, // synthetic — not a movement, just an audit row
          unitType: "USD",
          sourceType: "MANUAL",
          description: `Synced from fal.ai → balance $${current.toFixed(2)}, usage_this_month $${(b.usageThisMonth ?? 0).toFixed(2)}, expiring $${(b.expiringSoon ?? 0).toFixed(2)} (${b.source})`,
          createdByUserId: ctx.user.id,
        },
      });
      return ok({
        provider: provider.name,
        balance: current,
        usageThisMonth: b.usageThisMonth ?? 0,
        expiringSoon: b.expiringSoon ?? 0,
        source: b.source,
        rawResponse: b.raw,
        wallet: { id: wallet.id, availableCredits: wallet.availableCredits },
      });
    }

    return ok({ provider: provider.name, status: "no remote-balance API for this provider" });
  } catch (e) { return handleError(e); }
}
