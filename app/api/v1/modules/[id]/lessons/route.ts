import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const LessonCreate = z.object({ title: z.string().min(1), summary: z.string().optional(), durationSeconds: z.number().int().optional() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = LessonCreate.parse(await req.json());
    return ok(await prisma.lesson.create({ data: { ...body, moduleId: params.id } }), 201);
  } catch (e) { return handleError(e); }
}
