import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const EpisodeUpdate = z.object({
  title: z.string().optional(), synopsis: z.string().optional(),
  status: z.enum(["DRAFT","PLANNING","IN_PRODUCTION","REVIEW","READY_FOR_PUBLISH","PUBLISHED","ARCHIVED"]).optional(),
  scheduledPublishAt: z.string().datetime().optional(),
  seoTitle: z.string().optional(), seoDescription: z.string().optional(),
  seoTags: z.array(z.string()).optional(),
}).partial();

async function assertEpisodeInOrg(id: string, orgId: string) {
  const e = await prisma.episode.findFirst({ where: { id, season: { series: { project: { organizationId: orgId } } } } });
  if (!e) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return e;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await assertEpisodeInOrg(params.id, ctx.organizationId));
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertEpisodeInOrg(params.id, ctx.organizationId);
    const body = EpisodeUpdate.parse(await req.json());
    return ok(await prisma.episode.update({
      where: { id: params.id },
      data: { ...body, scheduledPublishAt: body.scheduledPublishAt ? new Date(body.scheduledPublishAt) : undefined },
    }));
  } catch (e) { return handleError(e); }
}
