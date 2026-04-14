import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SeoUpdate = z.object({ seoTitle: z.string().optional(), seoDescription: z.string().optional(), seoTags: z.array(z.string()).optional() });

async function assertEpisodeInOrg(id: string, orgId: string) {
  const e = await prisma.episode.findFirst({ where: { id, season: { series: { project: { organizationId: orgId } } } } });
  if (!e) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return e;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const ep = await assertEpisodeInOrg(params.id, ctx.organizationId);
    return ok({ seoTitle: ep.seoTitle, seoDescription: ep.seoDescription, seoTags: ep.seoTags });
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "publish_episode"); if (f) return f;
    const ep = await assertEpisodeInOrg(params.id, ctx.organizationId);
    const body = SeoUpdate.parse(await req.json());
    return ok(await prisma.episode.update({ where: { id: ep.id }, data: body }));
  } catch (e) { return handleError(e); }
}
