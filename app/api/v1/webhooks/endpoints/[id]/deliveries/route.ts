import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_webhooks"); if (f) return f;
    const ep = await prisma.webhookEndpoint.findFirst({ where: { id: params.id, organizationId: ctx.organizationId } });
    if (!ep) return NextResponse.json({ statusCode: 404, error: "NotFound", message: "not found" }, { status: 404 });
    return ok(await prisma.webhookDelivery.findMany({ where: { endpointId: params.id }, orderBy: { createdAt: "desc" }, take: 100 }));
  } catch (e) { return handleError(e); }
}
