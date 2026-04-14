import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectQuota } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const ApplyTemplate = z.object({ projectName: z.string().min(2) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "create_project"); if (f) return f;
    await assertProjectQuota(ctx.organizationId);
    const t = await prisma.projectTemplate.findUniqueOrThrow({ where: { id: params.id } });
    const body = ApplyTemplate.parse(await req.json());
    const project = await prisma.project.create({
      data: {
        organizationId: ctx.organizationId, createdByUserId: ctx.user.id,
        name: body.projectName, contentType: t.contentType,
        description: t.description ?? undefined, settings: { create: {} },
      },
    });
    await prisma.projectTemplate.update({ where: { id: t.id }, data: { usageCount: { increment: 1 } } });
    return ok(project, 201);
  } catch (e) { return handleError(e); }
}
