import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { CreateUserSchema } from "@/lib/schemas/user";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const forbid = requirePermission(ctx, "manage_users"); if (forbid) return forbid;
    return ok(await prisma.organizationUser.findMany({
      where: { organizationId: ctx.organizationId },
      include: { user: { select: { id: true, email: true, username: true, fullName: true, isActive: true, lastLoginAt: true, totpEnabled: true } }, role: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const forbid = requirePermission(ctx, "manage_users"); if (forbid) return forbid;
    const body = CreateUserSchema.parse(await req.json());
    const passwordHash = await bcrypt.hash(body.password, 10);
    const result = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { fullName: body.fullName, email: body.email, username: body.username, passwordHash, isActive: body.isActive } });
      await tx.organizationUser.create({ data: { organizationId: ctx.organizationId, userId: u.id, roleId: body.roleId } });
      return u;
    });
    return ok({ id: result.id }, 201);
  } catch (e) { return handleError(e); }
}
