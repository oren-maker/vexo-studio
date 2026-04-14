import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_users"); if (f) return f;
    await prisma.organizationUser.deleteMany({ where: { organizationId: ctx.organizationId, userId: params.userId } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
