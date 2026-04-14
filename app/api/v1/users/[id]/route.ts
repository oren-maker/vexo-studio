import { NextRequest, NextResponse } from "next/server";
import argon2 from "argon2";
import { prisma } from "@/lib/prisma";
import { UpdateUserSchema } from "@/lib/schemas/user";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_users"); if (f) return f;
    const m = await prisma.organizationUser.findFirst({ where: { organizationId: ctx.organizationId, userId: params.id }, include: { user: true, role: true } });
    if (!m) return NextResponse.json({ statusCode: 404, error: "NotFound", message: "not found" }, { status: 404 });
    return ok(m);
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_users"); if (f) return f;
    const member = await prisma.organizationUser.findFirst({ where: { organizationId: ctx.organizationId, userId: params.id } });
    if (!member) return NextResponse.json({ statusCode: 404, error: "NotFound", message: "not found" }, { status: 404 });
    const body = UpdateUserSchema.parse(await req.json());
    const data: Record<string, unknown> = { fullName: body.fullName, email: body.email, username: body.username, isActive: body.isActive };
    if (body.password) data.passwordHash = await argon2.hash(body.password);
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    const updated = await prisma.user.update({ where: { id: params.id }, data });
    if (body.roleId) {
      await prisma.organizationUser.update({
        where: { organizationId_userId: { organizationId: ctx.organizationId, userId: params.id } },
        data: { roleId: body.roleId },
      });
    }
    return ok(updated);
  } catch (e) { return handleError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_users"); if (f) return f;
    await prisma.organizationUser.deleteMany({ where: { organizationId: ctx.organizationId, userId: params.id } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
