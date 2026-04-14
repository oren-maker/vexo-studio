import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_providers"); if (f) return f;
    const provider = await prisma.provider.findFirst({ where: { id: params.id, organizationId: ctx.organizationId } });
    if (!provider) return NextResponse.json({ statusCode: 404, error: "NotFound", message: "not found" }, { status: 404 });
    return ok({ ok: true, provider: provider.name, status: "stub-not-implemented" });
  } catch (e) { return handleError(e); }
}
