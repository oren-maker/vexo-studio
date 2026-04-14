import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const EntryCreate = z.object({
  episodeId: z.string().cuid().optional(),
  lessonId: z.string().cuid().optional(),
  title: z.string().min(1),
  scheduledAt: z.string().datetime(),
  platform: z.string().default("YOUTUBE"),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_calendar"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const url = new URL(req.url);
    const from = url.searchParams.get("from"); const to = url.searchParams.get("to");
    return ok(await prisma.contentCalendarEntry.findMany({
      where: {
        projectId: params.id,
        scheduledAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
      },
      orderBy: { scheduledAt: "asc" },
    }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_calendar"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const body = EntryCreate.parse(await req.json());
    return ok(await prisma.contentCalendarEntry.create({
      data: { ...body, scheduledAt: new Date(body.scheduledAt), projectId: params.id },
    }), 201);
  } catch (e) { return handleError(e); }
}
