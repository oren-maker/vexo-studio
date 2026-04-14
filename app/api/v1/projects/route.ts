import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectQuota } from "@/lib/plan-limits";
import { auditLog } from "@/lib/audit";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const CreateProjectSchema = z.object({
  name: z.string().min(2),
  contentType: z.enum(["SERIES", "COURSE", "KIDS_CONTENT"]),
  description: z.string().optional(),
  language: z.string().default("he"),
  targetAudience: z.string().optional(),
  genreTag: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await prisma.project.findMany({
      where: { organizationId: ctx.organizationId },
      include: { settings: true, _count: { select: { series: true, courses: true } } },
      orderBy: { updatedAt: "desc" },
    }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "create_project"); if (f) return f;
    const body = CreateProjectSchema.parse(await req.json());
    await assertProjectQuota(ctx.organizationId);
    const project = await prisma.project.create({
      data: { ...body, organizationId: ctx.organizationId, createdByUserId: ctx.user.id, settings: { create: {} } },
      include: { settings: true },
    });
    await auditLog({ organizationId: ctx.organizationId, actorUserId: ctx.user.id, entityType: "PROJECT", entityId: project.id, action: "CREATE", newValue: project });
    return ok(project, 201);
  } catch (e) { return handleError(e); }
}
