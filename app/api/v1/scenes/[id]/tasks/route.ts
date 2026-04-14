import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const TaskCreate = z.object({
  taskType: z.enum(["REVIEW","APPROVE","GENERATE","PUBLISH"]),
  assignedTo: z.string().cuid(),
  dueAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await prisma.taskAssignment.findMany({ where: { sceneId: params.id }, orderBy: { createdAt: "desc" } }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = TaskCreate.parse(await req.json());
    return ok(await prisma.taskAssignment.create({
      data: { sceneId: params.id, assignedBy: ctx.user.id, assignedTo: body.assignedTo, taskType: body.taskType, dueAt: body.dueAt ? new Date(body.dueAt) : null, notes: body.notes },
    }), 201);
  } catch (e) { return handleError(e); }
}
