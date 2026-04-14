import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    const list = await prisma.userSession.findMany({
      where: { userId: ctx.user.id, isActive: true, expiresAt: { gt: new Date() } },
      select: { id: true, deviceName: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(list);
  } catch (e) { return handleError(e); }
}
