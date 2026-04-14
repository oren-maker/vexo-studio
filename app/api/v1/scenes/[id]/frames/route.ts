import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const FrameCreate = z.object({ orderIndex: z.number().int().min(0), beatSummary: z.string().optional(), imagePrompt: z.string().optional(), negativePrompt: z.string().optional() });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await prisma.sceneFrame.findMany({ where: { sceneId: params.id }, orderBy: { orderIndex: "asc" } }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = FrameCreate.parse(await req.json());
    return ok(await prisma.sceneFrame.create({ data: { ...body, sceneId: params.id } }), 201);
  } catch (e) { return handleError(e); }
}
