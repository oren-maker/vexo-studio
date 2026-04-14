import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await prisma.notificationEvent.findMany({
      where: { userId: ctx.user.id, organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" }, take: 100,
    }));
  } catch (e) { return handleError(e); }
}
