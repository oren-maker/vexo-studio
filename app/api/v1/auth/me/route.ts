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
    const u = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true, email: true, username: true, fullName: true, totpEnabled: true,
        organizations: {
          include: { organization: { select: { id: true, name: true, slug: true, plan: true } }, role: { select: { name: true } } },
        },
      },
    });
    return ok({
      user: u,
      currentOrganizationId: ctx.organizationId,
      memberships: ctx.user.memberships.map((m) => ({
        organizationId: m.organizationId, roleName: m.roleName, isOwner: m.isOwner, permissions: [...m.permissions],
      })),
    });
  } catch (e) { return handleError(e); }
}
