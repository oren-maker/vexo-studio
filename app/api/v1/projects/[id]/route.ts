import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { auditLog } from "@/lib/audit";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const UpdateProjectSchema = z.object({
  name: z.string().min(2).optional(),
  contentType: z.enum(["SERIES", "COURSE", "KIDS_CONTENT"]).optional(),
  description: z.string().optional(),
  language: z.string().optional(),
  targetAudience: z.string().optional(),
  genreTag: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
  thumbnailUrl: z.string().url().optional(),
  defaultDistributionPlatform: z.string().optional(),
  aiDirectorMode: z.enum(["MANUAL", "ASSISTED", "AUTOPILOT"]).optional(),
  autopilotEnabled: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertProjectInOrg(params.id, ctx.organizationId);
    return ok(await prisma.project.findUnique({
      where: { id: params.id },
      include: { settings: true, series: true, courses: true, aiDirector: true },
    }));
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const old = await assertProjectInOrg(params.id, ctx.organizationId);
    const body = UpdateProjectSchema.parse(await req.json());
    const updated = await prisma.project.update({ where: { id: params.id }, data: body });
    await auditLog({ organizationId: ctx.organizationId, actorUserId: ctx.user.id, entityType: "PROJECT", entityId: updated.id, action: "UPDATE", oldValue: old, newValue: updated });
    return ok(updated);
  } catch (e) { return handleError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "delete_project"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    await prisma.project.update({ where: { id: params.id }, data: { status: "ARCHIVED" } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
