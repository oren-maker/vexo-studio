import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const CommentCreate = z.object({ body: z.string().min(1), frameId: z.string().cuid().optional() });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await prisma.sceneComment.findMany({
      where: { sceneId: params.id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const body = CommentCreate.parse(await req.json());
    return ok(await prisma.sceneComment.create({ data: { ...body, sceneId: params.id, userId: ctx.user.id } }), 201);
  } catch (e) { return handleError(e); }
}
