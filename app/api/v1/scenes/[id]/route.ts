import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SceneUpdate = z.object({
  title: z.string().optional(), summary: z.string().optional(),
  scriptText: z.string().optional(), targetDurationSeconds: z.number().int().optional(),
  status: z.enum(["DRAFT","PLANNING","STORYBOARD_GENERATING","STORYBOARD_REVIEW","STORYBOARD_APPROVED","VIDEO_GENERATING","VIDEO_REVIEW","APPROVED","LOCKED"]).optional(),
}).partial();

async function assertSceneInOrg(id: string, orgId: string) {
  const s = await prisma.scene.findFirst({
    where: {
      id, OR: [
        { episode: { season: { series: { project: { organizationId: orgId } } } } },
        { lesson: { module: { course: { project: { organizationId: orgId } } } } },
      ],
    },
  });
  if (!s) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
  return s;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertSceneInOrg(params.id, ctx.organizationId);
    return ok(await prisma.scene.findUnique({
      where: { id: params.id },
      include: { frames: { orderBy: { orderIndex: "asc" } }, criticReviews: true, comments: true },
    }));
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertSceneInOrg(params.id, ctx.organizationId);
    return ok(await prisma.scene.update({ where: { id: params.id }, data: SceneUpdate.parse(await req.json()) }));
  } catch (e) { return handleError(e); }
}
