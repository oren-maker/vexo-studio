/**
 * Bulk-backfill Director Sheets for every scene in the org that doesn't have
 * one yet. Deadline-aware (55s) — returns `pending` count; UI loops until 0.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { buildDirectorSheet } from "@/lib/director-sheet";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;

    // Find scenes in this org without a director sheet
    const scenes = await prisma.scene.findMany({
      where: {
        OR: [
          { episode: { season: { series: { project: { organizationId: ctx.organizationId } } } } },
          { lesson: { module: { course: { project: { organizationId: ctx.organizationId } } } } },
        ],
      },
      select: { id: true, memoryContext: true },
      orderBy: { createdAt: "asc" },
    });
    const missing = scenes.filter((s) => {
      const mem = (s.memoryContext as { directorSheet?: unknown } | null) ?? {};
      return !mem.directorSheet;
    });

    const deadline = Date.now() + 55_000;
    const processed: { sceneId: string; ok: boolean; error?: string }[] = [];
    let pending = missing.length;
    for (const s of missing) {
      if (Date.now() > deadline) break;
      try {
        await buildDirectorSheet(s.id);
        processed.push({ sceneId: s.id, ok: true });
        pending--;
      } catch (e) {
        processed.push({ sceneId: s.id, ok: false, error: (e as Error).message.slice(0, 200) });
      }
    }
    return ok({ processed: processed.length, succeeded: processed.filter((p) => p.ok).length, pending, details: processed });
  } catch (e) { return handleError(e); }
}
