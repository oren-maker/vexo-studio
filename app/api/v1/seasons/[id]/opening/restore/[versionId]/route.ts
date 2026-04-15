/**
 * POST /api/v1/seasons/[id]/opening/restore/[versionId]
 * Copies a prior prompt version back into currentPrompt. First snapshots the
 * existing currentPrompt so the restore is itself reversible.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;

    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      select: { id: true },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });

    const opening = await prisma.seasonOpening.findUnique({ where: { seasonId: season.id } });
    if (!opening) throw Object.assign(new Error("opening not found"), { statusCode: 404 });

    const version = await prisma.seasonOpeningPromptVersion.findFirst({
      where: { id: params.versionId, openingId: opening.id },
    });
    if (!version) throw Object.assign(new Error("version not found"), { statusCode: 404 });

    // Snapshot current before overwriting (makes restore reversible).
    if (opening.currentPrompt && opening.currentPrompt !== version.prompt) {
      await prisma.seasonOpeningPromptVersion.create({
        data: { openingId: opening.id, prompt: opening.currentPrompt },
      });
    }
    await prisma.seasonOpening.update({
      where: { id: opening.id },
      data: { currentPrompt: version.prompt },
    });
    return ok({ restored: true, prompt: version.prompt });
  } catch (e) { return handleError(e); }
}
