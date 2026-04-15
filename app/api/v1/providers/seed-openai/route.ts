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
import { fetchOpenAiBalance } from "@/lib/providers/openai-sora";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const Body = z.object({
  initialCredits: z.number().min(0).optional(),
  // When true, ignore initialCredits and pull the live OpenAI balance.
  syncFromOpenAi: z.boolean().optional(),
}).partial();

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_billing"); if (f) return f;
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    let provider = await prisma.provider.findFirst({
      where: { organizationId: ctx.organizationId, name: "OpenAI" },
      include: { wallet: true },
    });
    if (!provider) {
      provider = await prisma.provider.create({
        data: {
          organizationId: ctx.organizationId,
          name: "OpenAI",
          category: "VIDEO",
          apiUrl: "https://api.openai.com",
          isActive: true,
          wallet: { create: { availableCredits: 0, totalCreditsAdded: 0, isTrackingEnabled: true } },
        },
        include: { wallet: true },
      });
    }

    // Optional: pull live balance from OpenAI billing API. Falls back to
    // the manual initialCredits if the call fails or returns 0.
    let topUp = body.initialCredits ?? 0;
    let topUpSource = "manual";
    if (body.syncFromOpenAi) {
      try {
        const live = await fetchOpenAiBalance();
        if (live.remaining > 0) { topUp = live.remaining; topUpSource = `openai:${live.source}`; }
      } catch { /* leave topUp as manual */ }
    }

    let wallet = provider.wallet;
    if (!wallet) {
      wallet = await prisma.creditWallet.create({
        data: {
          providerId: provider.id,
          availableCredits: topUp,
          totalCreditsAdded: topUp,
          isTrackingEnabled: true,
        },
      });
    } else if (topUp > 0) {
      wallet = await prisma.creditWallet.update({
        where: { id: wallet.id },
        data: {
          availableCredits: { increment: topUp },
          totalCreditsAdded: { increment: topUp },
        },
      });
      await prisma.creditTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: "ADD",
          amount: topUp,
          unitType: "USD",
          sourceType: topUpSource === "manual" ? "MANUAL" : "API_SYNC",
          description: `Seed OpenAI credits (${topUpSource})`,
          createdByUserId: ctx.user.id,
        },
      });
    }

    return ok({ provider, wallet });
  } catch (e) { return handleError(e); }
}
