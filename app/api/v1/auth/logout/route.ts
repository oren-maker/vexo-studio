import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    await prisma.userSession.updateMany({ where: { userId: ctx.user.id, isActive: true }, data: { isActive: false } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
