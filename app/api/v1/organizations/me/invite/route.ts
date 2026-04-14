import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { InviteMemberSchema } from "@/lib/schemas/organization";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_users"); if (f) return f;
    const body = InviteMemberSchema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return NextResponse.json({ statusCode: 404, error: "NotFound", message: "user not found — invite flow not yet implemented" }, { status: 404 });
    return ok(await prisma.organizationUser.upsert({
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId: user.id } },
      update: { roleId: body.roleId },
      create: { organizationId: ctx.organizationId, userId: user.id, roleId: body.roleId },
    }), 201);
  } catch (e) { return handleError(e); }
}
