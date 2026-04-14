import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_tokens"); if (f) return f;
    const w = await prisma.creditWallet.findFirst({ where: { id: params.id, provider: { organizationId: ctx.organizationId } } });
    if (!w) throw Object.assign(new Error("wallet not in org"), { statusCode: 404 });
    return ok(await prisma.creditTransaction.findMany({ where: { walletId: params.id }, orderBy: { createdAt: "desc" }, take: 200 }));
  } catch (e) { return handleError(e); }
}
