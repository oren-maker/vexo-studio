import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CreateApiKeySchema } from "@/lib/schemas/api-key";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { hashSha256 } from "@/lib/crypto";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_api_keys"); if (f) return f;
    return ok(await prisma.apiKey.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true, keyPrefix: true, scopes: true, lastUsedAt: true, expiresAt: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_api_keys"); if (f) return f;
    const body = CreateApiKeySchema.parse(await req.json());
    const raw = `vexo_sk_${crypto.randomBytes(24).toString("base64url")}`;
    const created = await prisma.apiKey.create({
      data: {
        organizationId: ctx.organizationId, name: body.name, keyHash: hashSha256(raw), keyPrefix: raw.slice(0, 16),
        scopes: body.scopes, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdByUserId: ctx.user.id,
      },
    });
    return ok({ id: created.id, name: created.name, key: raw, prefix: created.keyPrefix }, 201);
  } catch (e) { return handleError(e); }
}
