import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await prisma.notificationEvent.updateMany({ where: { id: params.id, userId: ctx.user.id }, data: { isRead: true, readAt: new Date() } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
