import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { ok, handleError } from "@/lib/route-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const logs = await (prisma as any).sceneLog.findMany({
      where: { sceneId: params.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok({ logs });
  } catch (e) { return handleError(e); }
}
