/**
 * POST /api/v1/providers/seed-openai
 * Ensures an "OpenAI" provider + wallet exist in this org, with the configured
 * balance seeded as initial credits. Reconciles spent / available from
 * CostEntry rows. Called by the admin wallets page or on first Sora run.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const Body = z.object({
  initialCredits: z.number().min(0).default(0),
}).partial();

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_billing"); if (f) return f;
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    let provider = await prisma.provider.findFirst({
      where: { organizationId: ctx.organizationId, name: "OpenAI" },
    });
    if (!provider) {
      provider = await prisma.provider.create({
        data: {
          organizationId: ctx.organizationId,
          name: "OpenAI",
          category: "VIDEO",
          apiUrl: "https://api.openai.com",
          isActive: true,
        },
      });
    }

    let wallet = await prisma.creditWallet.findUnique({ where: { providerId: provider.id } });
    if (!wallet) {
      wallet = await prisma.creditWallet.create({
        data: {
          providerId: provider.id,
          availableCredits: body.initialCredits ?? 0,
          totalCreditsAdded: body.initialCredits ?? 0,
          isTrackingEnabled: true,
        },
      });
    } else if (body.initialCredits != null && body.initialCredits > 0) {
      // Top up by the configured amount
      wallet = await prisma.creditWallet.update({
        where: { id: wallet.id },
        data: {
          availableCredits: { increment: body.initialCredits },
          totalCreditsAdded: { increment: body.initialCredits },
        },
      });
      await prisma.creditTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: "ADD",
          amount: body.initialCredits,
          unitType: "USD",
          sourceType: "MANUAL",
          description: "Seed from OpenAI credit balance",
          createdByUserId: ctx.user.id,
        },
      });
    }

    return ok({ provider, wallet });
  } catch (e) { return handleError(e); }
}
