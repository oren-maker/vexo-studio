import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await prisma.sceneComment.update({
      where: { id: params.id },
      data: { resolved: true, resolvedAt: new Date(), resolvedBy: ctx.user.id },
    }));
  } catch (e) { return handleError(e); }
}
