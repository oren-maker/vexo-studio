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
    return ok(await prisma.provider.findMany({
      where: { organizationId: ctx.organizationId },
      include: { wallet: true },
      orderBy: { name: "asc" },
    }));
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
