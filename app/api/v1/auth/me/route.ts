import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SelfUpdateSchema = z.object({
  fullName: z.string().min(2).optional(),
  language: z.enum(["en", "he"]).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    const body = SelfUpdateSchema.parse(await req.json());
    return ok(await prisma.user.update({
      where: { id: ctx.user.id },
      data: body,
      select: { id: true, fullName: true, email: true, language: true },
    }));
  } catch (e) { return handleError(e); }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    const u = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true, email: true, username: true, fullName: true, totpEnabled: true, language: true,
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
