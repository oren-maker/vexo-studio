import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CreateProviderSchema } from "@/lib/schemas/provider";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_providers"); if (f) return f;

    // Ensure Google Gemini exists as a standalone provider so it shows in the
    // wallets table even before the first AI call.
    const hasGemini = await prisma.provider.findFirst({ where: { organizationId: ctx.organizationId, name: "Google Gemini" } });
    if (!hasGemini) {
      try {
        const p = await prisma.provider.create({
          data: {
            organizationId: ctx.organizationId,
            name: "Google Gemini",
            category: "TEXT",
            apiUrl: "https://generativelanguage.googleapis.com",
            isActive: true,
          },
        });
        await prisma.creditWallet.create({
          data: { providerId: p.id, availableCredits: 0, totalCreditsAdded: 0, isTrackingEnabled: true },
        }).catch(() => {});
      } catch { /* race — fine */ }
    }

    const providers = await prisma.provider.findMany({
      where: { organizationId: ctx.organizationId },
      include: { wallet: true },
      orderBy: { name: "asc" },
    });
    // Aggregate spend per provider from CostEntry — true source of truth, independent of wallet balance.
    const spendRows = await prisma.costEntry.groupBy({
      by: ["providerId"],
      where: { providerId: { in: providers.map((p) => p.id) } },
      _sum: { totalCost: true },
      _count: { id: true },
    });
    const spendByProvider = new Map(spendRows.map((r) => [r.providerId, { total: r._sum.totalCost ?? 0, calls: r._count.id }]));
    return ok(providers.map((p) => ({
      ...p,
      totalSpent: +(spendByProvider.get(p.id)?.total ?? 0).toFixed(4),
      totalCalls: spendByProvider.get(p.id)?.calls ?? 0,
    })));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_providers"); if (f) return f;
    const body = CreateProviderSchema.parse(await req.json());
    return ok(await prisma.provider.create({
      data: {
        organizationId: ctx.organizationId,
        name: body.name, category: body.category, apiUrl: body.apiUrl,
        apiKeyEncrypted: body.apiKey ? encrypt(body.apiKey) : undefined,
        isActive: body.isActive, notes: body.notes,
      },
    }), 201);
  } catch (e) { return handleError(e); }
}
