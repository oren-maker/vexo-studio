import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const EntryUpdate = z.object({
  title: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  platform: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["SCHEDULED","PUBLISHED","CANCELLED"]).optional(),
}).partial();

async function assertEntryInOrg(id: string, orgId: string) {
  const e = await prisma.contentCalendarEntry.findFirst({ where: { id, project: { organizationId: orgId } } });
  if (!e) throw Object.assign(new Error("entry not found"), { statusCode: 404 });
  return e;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_calendar"); if (f) return f;
    await assertEntryInOrg(params.id, ctx.organizationId);
    const body = EntryUpdate.parse(await req.json());
    return ok(await prisma.contentCalendarEntry.update({
      where: { id: params.id },
      data: { ...body, scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined },
    }));
  } catch (e) { return handleError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_calendar"); if (f) return f;
    await assertEntryInOrg(params.id, ctx.organizationId);
    await prisma.contentCalendarEntry.update({ where: { id: params.id }, data: { status: "CANCELLED" } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
