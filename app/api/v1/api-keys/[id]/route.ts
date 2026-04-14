import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_api_keys"); if (f) return f;
    await prisma.apiKey.updateMany({ where: { id: params.id, organizationId: ctx.organizationId }, data: { isActive: false } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
