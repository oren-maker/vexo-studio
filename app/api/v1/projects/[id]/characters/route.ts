import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const CharacterCreate = z.object({
  name: z.string().min(1), roleType: z.string().optional(),
  characterType: z.enum(["HUMAN","ANIMATED","NARRATOR"]).optional(),
  gender: z.string().optional(), ageRange: z.string().optional(),
  appearance: z.string().optional(), personality: z.string().optional(),
  wardrobeRules: z.string().optional(), speechStyle: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const chars = await prisma.character.findMany({
      where: { projectId: params.id },
      include: { media: { orderBy: { createdAt: "asc" } }, voices: true },
    });
    const mediaIds = chars.flatMap((c) => c.media.map((m) => m.id));
    const costs = mediaIds.length
      ? await prisma.costEntry.findMany({ where: { entityType: "CHARACTER_MEDIA", entityId: { in: mediaIds } } })
      : [];
    const costByMedia = new Map<string, number>();
    for (const c of costs) costByMedia.set(c.entityId, (costByMedia.get(c.entityId) ?? 0) + c.totalCost);
    const enriched = chars.map((c) => ({
      ...c,
      media: c.media.map((m) => ({ ...m, cost: +(costByMedia.get(m.id) ?? 0).toFixed(4) })),
    }));
    return ok(enriched);
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const body = CharacterCreate.parse(await req.json());
    return ok(await prisma.character.create({ data: { ...body, projectId: params.id } }), 201);
  } catch (e) { return handleError(e); }
}
