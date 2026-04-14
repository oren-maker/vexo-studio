import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { WalletAdjustmentSchema } from "@/lib/schemas/wallet";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_tokens"); if (f) return f;
    const w = await prisma.creditWallet.findFirst({ where: { id: params.id, provider: { organizationId: ctx.organizationId } } });
    if (!w) throw Object.assign(new Error("wallet not in org"), { statusCode: 404 });
    const body = WalletAdjustmentSchema.parse(await req.json());
    return ok(await prisma.$transaction(async (tx) => {
      const updated = await tx.creditWallet.update({ where: { id: params.id }, data: { availableCredits: { decrement: body.amount } } });
      await tx.creditTransaction.create({ data: { walletId: updated.id, transactionType: "DEDUCT", amount: body.amount, unitType: body.unitType, sourceType: "MANUAL", description: body.description, createdByUserId: ctx.user.id, referenceId: body.referenceId } });
      return updated;
    }));
  } catch (e) { return handleError(e); }
}
