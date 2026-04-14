import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { getContext } from "@/lib/project-context";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const c = await getContext(params.id);
    const logs = await prisma.aILog.findMany({
      where: { projectId: params.id, actionType: "CONTEXT_REFRESH" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const download = new URL(req.url).searchParams.get("download") === "1";
    if (download && c) {
      return new NextResponse(JSON.stringify({ cache: c, logs }, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="series-context-${params.id}.json"`,
        },
      });
    }
    return ok({ cache: c, logs });
  } catch (e) { return handleError(e); }
}
