import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const ModuleCreate = z.object({ title: z.string().min(1), orderIndex: z.number().int().min(0), description: z.string().optional() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = ModuleCreate.parse(await req.json());
    return ok(await prisma.courseModule.create({ data: { ...body, courseId: params.id } }), 201);
  } catch (e) { return handleError(e); }
}
