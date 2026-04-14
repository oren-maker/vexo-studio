import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const DistributionUpsert = z.object({
  platform: z.string().default("YOUTUBE"),
  channelIntegrationId: z.string().cuid(),
  publishingMode: z.enum(["MANUAL","SEMI_AUTO","FULL_AUTO"]).default("MANUAL"),
  autoPublishEnabled: z.boolean().default(false),
  defaultPrivacy: z.enum(["PUBLIC","UNLISTED","PRIVATE"]).default("PRIVATE"),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertProjectInOrg(params.id, ctx.organizationId);
    return ok(await prisma.projectDistribution.findMany({ where: { projectId: params.id } }));
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_distribution"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const body = DistributionUpsert.parse(await req.json());
    return ok(await prisma.projectDistribution.upsert({
      where: { id: `${params.id}-${body.platform}` },
      update: body,
      create: { ...body, projectId: params.id, id: `${params.id}-${body.platform}` },
    }));
  } catch (e) { return handleError(e); }
}
