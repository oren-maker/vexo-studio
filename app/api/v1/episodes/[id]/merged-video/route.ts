/**
 * GET — latest merged-episode Asset (or 404).
 * POST — body: { blobUrl, durationSeconds, clipCount, sourceClips } — record the
 * stitched MP4 the browser just uploaded to Vercel Blob as an Asset row.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

async function assertEpisodeInOrg(id: string, orgId: string) {
  const ep = await prisma.episode.findFirst({
    where: { id, season: { series: { project: { organizationId: orgId } } } },
    select: { id: true, season: { select: { series: { select: { projectId: true } } } } },
  });
  if (!ep) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return ep;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertEpisodeInOrg(params.id, ctx.organizationId);

    const assets = await prisma.asset.findMany({
      where: { entityType: "EPISODE", entityId: params.id, assetType: "VIDEO", status: "READY" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, fileUrl: true, createdAt: true, metadata: true },
    });
    const merged = assets.find((a) => (a.metadata as { kind?: string } | null)?.kind === "merged-episode") ?? null;
    return ok({ merged, history: assets });
  } catch (e) { return handleError(e); }
}

const Body = z.object({
  blobUrl: z.string().url(),
  durationSeconds: z.number().positive().optional(),
  clipCount: z.number().int().positive(),
  sourceClips: z.array(z.object({ url: z.string(), label: z.string(), kind: z.string() })).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const ep = await assertEpisodeInOrg(params.id, ctx.organizationId);
    const body = Body.parse(await req.json());

    const asset = await prisma.asset.create({
      data: {
        projectId: ep.season.series.projectId,
        entityType: "EPISODE", entityId: params.id, assetType: "VIDEO",
        fileUrl: body.blobUrl,
        mimeType: "video/mp4",
        durationSeconds: body.durationSeconds,
        status: "READY",
        metadata: {
          kind: "merged-episode",
          clipCount: body.clipCount,
          builtAt: new Date().toISOString(),
          builtBy: ctx.user.id,
          sourceClips: body.sourceClips ?? [],
        } as object,
      },
    });
    return ok({ merged: asset });
  } catch (e) { return handleError(e); }
}
