import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const VariantCreate = z.object({ assetId: z.string().cuid(), label: z.string().min(1) });

async function assertEpisodeInOrg(id: string, orgId: string) {
  const e = await prisma.episode.findFirst({ where: { id, season: { series: { project: { organizationId: orgId } } } } });
  if (!e) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return e;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertEpisodeInOrg(params.id, ctx.organizationId);
    return ok(await prisma.thumbnailVariant.findMany({ where: { episodeId: params.id }, orderBy: { createdAt: "asc" } }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "publish_episode"); if (f) return f;
    await assertEpisodeInOrg(params.id, ctx.organizationId);
    const body = VariantCreate.parse(await req.json());
    return ok(await prisma.thumbnailVariant.create({ data: { ...body, episodeId: params.id } }), 201);
  } catch (e) { return handleError(e); }
}
