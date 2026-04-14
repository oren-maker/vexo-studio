import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const FrameUpdate = z.object({
  orderIndex: z.number().int().min(0).optional(), beatSummary: z.string().optional(),
  imagePrompt: z.string().optional(), negativePrompt: z.string().optional(),
  approvedImageUrl: z.string().url().optional(), status: z.string().optional(),
}).partial();

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    return ok(await prisma.sceneFrame.update({ where: { id: params.id }, data: FrameUpdate.parse(await req.json()) }));
  } catch (e) { return handleError(e); }
}
