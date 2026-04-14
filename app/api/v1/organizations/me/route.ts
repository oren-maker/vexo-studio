import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { UpdateOrganizationSchema } from "@/lib/schemas/organization";
import { PLAN_LIMITS } from "@/lib/constants";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await prisma.organization.findUnique({ where: { id: ctx.organizationId } }));
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_organization"); if (f) return f;
    const body = UpdateOrganizationSchema.parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    if (body.plan) {
      const limits = PLAN_LIMITS[body.plan];
      data.maxProjects = limits.maxProjects;
      data.maxEpisodes = limits.maxEpisodes;
      data.whitelabelEnabled = limits.whitelabel;
    }
    return ok(await prisma.organization.update({ where: { id: ctx.organizationId }, data }));
  } catch (e) { return handleError(e); }
}
