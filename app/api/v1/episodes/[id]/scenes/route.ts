import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SceneCreate = z.object({
  sceneNumber: z.number().int().positive(), title: z.string().optional(),
  summary: z.string().optional(), scriptText: z.string().optional(),
  targetDurationSeconds: z.number().int().optional(),
});

async function assertEpisodeInOrg(id: string, orgId: string) {
  const e = await prisma.episode.findFirst({ where: { id, season: { series: { project: { organizationId: orgId } } } } });
  if (!e) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return e;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertEpisodeInOrg(params.id, ctx.organizationId);
    // UI never reads frame fields from this endpoint — only needs scene rows.
    // Replace frames include with _count so the list page can show "N frames".
    return ok(await prisma.scene.findMany({
      where: { episodeId: params.id },
      orderBy: { sceneNumber: "asc" },
      include: { _count: { select: { frames: true } } },
    }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertEpisodeInOrg(params.id, ctx.organizationId);
    const body = SceneCreate.parse(await req.json());
    return ok(await prisma.scene.create({
      data: { ...body, parentType: "EPISODE", parentId: params.id, episodeId: params.id },
    }), 201);
  } catch (e) { return handleError(e); }
}
