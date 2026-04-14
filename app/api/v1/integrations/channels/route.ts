import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_distribution"); if (f) return f;
    return ok(await prisma.channelIntegration.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, provider: true, channelName: true, channelId: true, tokenExpiry: true, isActive: true, createdAt: true },
    }));
  } catch (e) { return handleError(e); }
}
