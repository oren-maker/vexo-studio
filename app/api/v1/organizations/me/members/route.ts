import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await prisma.organizationUser.findMany({
      where: { organizationId: ctx.organizationId },
      include: { user: { select: { id: true, email: true, fullName: true, totpEnabled: true, lastLoginAt: true } }, role: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }));
  } catch (e) { return handleError(e); }
}
