import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CreateWebhookSchema } from "@/lib/schemas/webhook";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_webhooks"); if (f) return f;
    return ok(await prisma.webhookEndpoint.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" } }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_webhooks"); if (f) return f;
    const body = CreateWebhookSchema.parse(await req.json());
    const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
    const created = await prisma.webhookEndpoint.create({
      data: { organizationId: ctx.organizationId, url: body.url, secret, events: body.events, isActive: body.isActive },
    });
    return ok({ ...created, secret }, 201);
  } catch (e) { return handleError(e); }
}
