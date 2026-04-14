import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const TemplateCreate = z.object({
  name: z.string().min(2),
  contentType: z.enum(["SERIES","COURSE","KIDS_CONTENT"]),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  episodeStructure: z.any().optional(),
  characterPresets: z.any().optional(),
  isPublic: z.boolean().default(false),
  isPremium: z.boolean().default(false),
  price: z.number().min(0).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await prisma.projectTemplate.findMany({
      where: { OR: [{ organizationId: ctx.organizationId }, { isPublic: true }] },
      orderBy: { usageCount: "desc" },
    }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_templates"); if (f) return f;
    const body = TemplateCreate.parse(await req.json());
    return ok(await prisma.projectTemplate.create({
      data: { ...body, organizationId: ctx.organizationId, createdByUserId: ctx.user.id },
    }), 201);
  } catch (e) { return handleError(e); }
}
