/**
 * POST /api/v1/scenes/[id]/remix-video
 * Body: { assetId, prompt }
 *
 * Takes an existing Sora-generated scene video Asset, calls OpenAI's
 * `/v1/videos/{id}/remix`, and records the new pending job on the scene.
 * The scene's GET handler will pick it up and store the resulting MP4 as a
 * fresh Asset row when it lands. Identity / look / motion are preserved
 * automatically — only the prompt-described change is applied.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { remixSoraVideo, priceSora, type SoraModel } from "@/lib/providers/openai-sora";
import { chargeUsd } from "@/lib/billing";
import { logUsage } from "@/lib/learn/usage-tracker";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30;

// Sora's /remix endpoint accepts up to 2000 chars. We intentionally accept
// any length here (up to 8000) so the UI isn't hostile to long director
// notes, then auto-trim before the Sora call.
const Body = z.object({
  assetId: z.string().min(1),
  prompt: z.string().min(3).max(8000),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    const body = Body.parse(await req.json());

    const scene = await prisma.scene.findFirst({
      where: {
        id: params.id, OR: [
          { episode: { season: { series: { project: { organizationId: ctx.organizationId } } } } },
          { lesson: { module: { course: { project: { organizationId: ctx.organizationId } } } } },
        ],
      },
      include: {
        episode: {
          include: {
            season: { include: { series: { include: { project: { select: { id: true, name: true } } } } } },
            _count: { select: { scenes: true } },
          },
        },
      },
    });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });

    const asset = await prisma.asset.findFirst({
      where: { id: body.assetId, entityType: "SCENE", entityId: scene.id, assetType: "VIDEO" },
      select: { id: true, metadata: true, fileUrl: true },
    });
    if (!asset) throw Object.assign(new Error("video not found on this scene"), { statusCode: 404 });

    // Sora video id was stored as the Asset's `videoUri`-equivalent — for
    // Sora-generated assets we used proxy URL `…/sora-proxy?id=video_…`.
    // Extract the id from there or from metadata.
    const meta = (asset.metadata as { provider?: string; soraVideoId?: string; model?: string } | null) ?? {};
    let soraId = meta.soraVideoId;
    if (!soraId) {
      const m = asset.fileUrl.match(/[?&]id=(video_[^&]+)/);
      if (m) soraId = m[1];
    }
    if (!soraId) throw Object.assign(new Error("this video is not a Sora-generated asset (no source id)"), { statusCode: 400 });

    // Same sanitizer + rules as generate-video. Sora's `remix` endpoint
    // inherits every pixel / behaviour from the source unless the new prompt
    // overrides it — so the same "bake the reference grid" and "fade-to-black
    // between scenes" failure modes apply here.
    const ep = scene.episode;
    const seasonNum = ep?.season?.seasonNumber;
    const epNum = ep?.episodeNumber;
    const seriesTitle = ep?.season?.series?.title ?? ep?.season?.series?.project?.name ?? "";
    const mem = (scene.memoryContext as { characters?: string[]; soundNotes?: string } | null) ?? {};
    const isFirstScene = scene.sceneNumber === 1;
    const totalScenes = scene.episode?._count?.scenes ?? null;
    const isLastSceneOfEpisode = totalScenes != null && scene.sceneNumber === totalScenes;

    const PROBLEMATIC: RegExp[] = [
      /\btitle\b[^.]{0,80}\bfades? in\b[^.]*\./gi,
      /\bseason\s*\d+\s*[·•·]?\s*episode\s*\d+\b[^.]*\bfades? in\b[^.]*\./gi,
      /\b(lock\s+identity\s+to|anchor\s+to|match)\s+the\s+reference\s+image[s]?\b[^.]*\./gi,
      /\breference\s+image[s]?\s+(for|of)\s+[A-Z][a-zA-Z ]+\s+(across|throughout|in)\b[^.]*\./gi,
      /\bshow\s+(the|a)\s+character\s+(sheet|grid|lineup|composite)\b[^.]*\./gi,
      /\bportrait\s+(grid|lineup|composite|sheet)\b[^.]*\./gi,
    ];
    const sanitize = (t: string | null | undefined) => {
      if (!t) return "";
      let out = String(t);
      for (const re of PROBLEMATIC) out = out.replace(re, "");
      return out.replace(/\s{3,}/g, " ").trim();
    };
    const scriptTextClean = sanitize(scene.scriptText);

    const titleCardBlock = isFirstScene && seasonNum != null && epNum != null
      ? `REQUIRED OPENING TITLE CARD — NON-NEGOTIABLE. Frames 0.0–2.0s: pure black screen with the text "SEASON ${seasonNum} · EPISODE ${epNum}" in large, crisp, clean white Helvetica Bold sans-serif typography (font weight 700, ~9% of screen height), perfectly centered with 15% safe margins. The text must be legible — not stylised, not decorative, not handwritten, not 3D, not glowing, not textured. Frames 2.0–2.5s: smooth fade to black. Only after 2.5s does the live-action scene begin. A calm adult male narrator voice says "Season ${seasonNum}, Episode ${epNum}" in English, timed to finish just before the text starts fading. NO other on-screen text anywhere else in the clip.`
      : "";

    const noReferenceGridRule = `HARD OVERRIDE (i2v safety, NON-NEGOTIABLE): the source video and any reference image(s) are a LOOKUP ONLY for identity, wardrobe, and location. NONE of these MUST appear on screen: no character reference grid / portrait sheet / character lineup, no side-by-side portraits or split-screen showing the reference, no title-cards of the character's name with their photo, no fade-in from a reference image, no "introduction card" before the action. The video begins with the required opening title card (scene 1) or directly with the live-action scene (mid-episode).`;

    const endFrameRule = isLastSceneOfEpisode
      ? `END-FRAME (episode finale): the final 1.5 seconds fade smoothly to pure black, audio ducks to silence in sync. This is the episode's end card.`
      : `END-FRAME (mid-episode, NON-NEGOTIABLE): the final 1 second of this clip MUST settle into a cleanly composed, stable frame — no motion blur, characters holding position, lighting steady, every on-screen object clearly visible. This exact frame will seed the next clip via i2v. DO NOT fade to black and DO NOT end mid-motion.`;

    const originalContext = [
      titleCardBlock,
      noReferenceGridRule,
      seriesTitle ? `Series: "${seriesTitle}"` : null,
      scriptTextClean ? `Original script (maintain these requirements):\n${scriptTextClean.slice(0, 1200)}` : null,
      mem.characters?.length ? `Characters in scene: ${mem.characters.join(", ")}` : null,
      endFrameRule,
    ].filter(Boolean).join("\n\n");

    const dedupedPrompt = [originalContext, "--- REMIX NOTES (apply these changes) ---", body.prompt].join("\n\n");
    const submitted = await remixSoraVideo({ sourceId: soraId, prompt: dedupedPrompt });

    // Track pending — same shape generate-video uses.
    const existingMem = (scene.memoryContext as Record<string, unknown> | null) ?? {};
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        memoryContext: {
          ...existingMem,
          pendingVideoJob: {
            provider: "openai",
            jobId: submitted.id,
            model: submitted.model,
            durationSeconds: parseInt(submitted.seconds, 10),
            submittedAt: new Date().toISOString(),
            kind: "remix",
            sourceAssetId: asset.id,
          },
        } as object,
      },
    });

    const sec = parseInt(submitted.seconds, 10);
    const cost = priceSora(submitted.model as SoraModel, sec);
    const projectId = scene.episode?.season.series.projectId;
    if (projectId) {
      await chargeUsd({
        organizationId: ctx.organizationId, projectId,
        entityType: "SCENE", entityId: scene.id,
        providerName: "OpenAI", category: "GENERATION",
        description: `Sora remix · ${submitted.model} · ${sec}s`,
        unitCost: cost, quantity: 1, userId: ctx.user.id,
      }).catch(() => {});
      // Mirror to ApiUsage so /admin/wallets + /learn/tokens show remix
      // spend under the unified openai-video engine, same as fresh generations.
      void logUsage({
        model: submitted.model,
        operation: "video-gen",
        videoSeconds: sec,
        sourceId: scene.id,
        meta: {
          engine: "openai-video",
          sceneId: scene.id,
          episodeId: scene.episodeId,
          seasonId: scene.episode?.seasonId,
          title: `Remix scene ${scene.sceneNumber ?? ""}`,
          purpose: "scene-remix",
          jobId: submitted.id,
          sourceAssetId: asset.id,
        },
      }).catch(() => {});
    }
    // Scene activity log entry so the "פעילות" tab captures the remix.
    await (prisma as any).sceneLog.create({
      data: {
        sceneId: scene.id,
        action: "video_remix",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
        details: {
          sourceAssetId: asset.id,
          jobId: submitted.id,
          model: submitted.model,
          seconds: sec,
          estimateUsd: cost,
          promptPreview: body.prompt.slice(0, 300),
        },
      },
    }).catch(() => {});

    return ok({ jobId: submitted.id, model: submitted.model, seconds: sec, estimateUsd: cost, sourceAssetId: asset.id });
  } catch (e) { return handleError(e); }
}
