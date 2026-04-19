import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse, requirePermission } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const maxDuration = 120;

// Approves every scene in the episode that's in VIDEO_REVIEW.
// Does NOT extract bridgeFrames here (heavy ffmpeg call) — caller can
// trigger /scenes/[id]/approve individually for that, or rely on the cron.
// This endpoint is the fast path: flip statuses + log. Bridge-frame
// extraction remains opt-in per-scene via the standard approve route.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;

    const scenes = await prisma.scene.findMany({
      where: { episodeId: params.id, status: "VIDEO_REVIEW" },
      select: { id: true, sceneNumber: true },
    });
    if (scenes.length === 0) return ok({ approved: 0, reason: "no VIDEO_REVIEW scenes in episode" });

    await prisma.$transaction(
      scenes.map((s) =>
        prisma.scene.update({
          where: { id: s.id },
          data: { status: "APPROVED" },
        })
      )
    );
    // Log each approval for the activity feed
    await Promise.all(scenes.map((s) =>
      (prisma as any).sceneLog.create({
        data: { sceneId: s.id, action: "scene_bulk_approved", actor: "user:bulk", actorName: ctx.user.fullName ?? ctx.user.email, details: { batch: true } },
      }).catch(() => {})
    ));

    return ok({ approved: scenes.length, sceneNumbers: scenes.map((s) => s.sceneNumber) });
  } catch (e) { return handleError(e); }
}
