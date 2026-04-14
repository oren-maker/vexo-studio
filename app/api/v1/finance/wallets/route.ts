import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CreateWalletSchema } from "@/lib/schemas/wallet";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_tokens"); if (f) return f;
    return ok(await prisma.creditWallet.findMany({
      where: { provider: { organizationId: ctx.organizationId } },
      include: { provider: true },
    }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_tokens"); if (f) return f;
    const body = CreateWalletSchema.parse(await req.json());
    const provider = await prisma.provider.findFirst({ where: { id: body.providerId, organizationId: ctx.organizationId } });
    if (!provider) throw Object.assign(new Error("provider not in org"), { statusCode: 404 });
    return ok(await prisma.creditWallet.create({
      data: { providerId: body.providerId, totalCreditsAdded: body.initialCredits, availableCredits: body.initialCredits, lowBalanceThreshold: body.lowBalanceThreshold, criticalBalanceThreshold: body.criticalBalanceThreshold, isTrackingEnabled: body.isTrackingEnabled, notes: body.notes },
    }), 201);
  } catch (e) { return handleError(e); }
}
