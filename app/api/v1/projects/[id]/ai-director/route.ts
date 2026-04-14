import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const Upd = z.object({
  mode: z.enum(["MANUAL","ASSISTED","AUTOPILOT"]).optional(),
  learningEnabled: z.boolean().optional(),
  autopilotEnabled: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertProjectInOrg(params.id, ctx.organizationId);
    return ok(await prisma.aIDirector.upsert({ where: { projectId: params.id }, update: {}, create: { projectId: params.id } }));
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_ai_director"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const body = Upd.parse(await req.json());
    return ok(await prisma.aIDirector.upsert({ where: { projectId: params.id }, update: body, create: { projectId: params.id, ...body } }));
  } catch (e) { return handleError(e); }
}
