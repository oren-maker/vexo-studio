import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UpdateProviderSchema } from "@/lib/schemas/provider";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_providers"); if (f) return f;
    const existing = await prisma.provider.findFirst({ where: { id: params.id, organizationId: ctx.organizationId } });
    if (!existing) return NextResponse.json({ statusCode: 404, error: "NotFound", message: "not found" }, { status: 404 });
    const body = UpdateProviderSchema.parse(await req.json());
    return ok(await prisma.provider.update({
      where: { id: params.id },
      data: {
        name: body.name, category: body.category, apiUrl: body.apiUrl,
        apiKeyEncrypted: body.apiKey ? encrypt(body.apiKey) : undefined,
        isActive: body.isActive, notes: body.notes,
      },
    }));
  } catch (e) { return handleError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_providers"); if (f) return f;
    const existing = await prisma.provider.findFirst({ where: { id: params.id, organizationId: ctx.organizationId } });
    if (!existing) return NextResponse.json({ statusCode: 404, error: "NotFound", message: "not found" }, { status: 404 });
    await prisma.provider.update({ where: { id: params.id }, data: { isActive: false } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
