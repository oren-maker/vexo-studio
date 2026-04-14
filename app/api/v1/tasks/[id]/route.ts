import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const TaskUpdate = z.object({ status: z.enum(["OPEN","IN_PROGRESS","DONE"]).optional(), notes: z.string().optional(), dueAt: z.string().datetime().optional() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const body = TaskUpdate.parse(await req.json());
    return ok(await prisma.taskAssignment.update({
      where: { id: params.id },
      data: {
        status: body.status, notes: body.notes,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        completedAt: body.status === "DONE" ? new Date() : undefined,
      },
    }));
  } catch (e) { return handleError(e); }
}
