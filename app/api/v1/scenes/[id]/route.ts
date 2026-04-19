import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";
import { pollVeoOperation } from "@/lib/providers/google-veo";
import { pollSoraVideo } from "@/lib/providers/openai-sora";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SceneUpdate = z.object({
  title: z.string().optional(), summary: z.string().optional(),
  scriptText: z.string().optional(), targetDurationSeconds: z.number().int().optional(),
  status: z.enum(["DRAFT","PLANNING","STORYBOARD_GENERATING","STORYBOARD_REVIEW","STORYBOARD_APPROVED","VIDEO_GENERATING","VIDEO_REVIEW","APPROVED","LOCKED"]).optional(),
  memoryContext: z.record(z.any()).optional(),
}).partial();

async function assertSceneInOrg(id: string, orgId: string) {
  const s = await prisma.scene.findFirst({
    where: {
      id, OR: [
        { episode: { season: { series: { project: { organizationId: orgId } } } } },
        { lesson: { module: { course: { project: { organizationId: orgId } } } } },
      ],
    },
  });
  if (!s) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
  return s;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertSceneInOrg(params.id, ctx.organizationId);
    let scene = await prisma.scene.findUnique({
      where: { id: params.id },
      include: { frames: { orderBy: { orderIndex: "asc" } }, criticReviews: true, comments: true },
    });
    if (!scene) return ok(null);

    // Sora + Google VEO don't have webhooks, so we poll on every GET while a
    // pendingVideoJob is recorded in memoryContext. When the video is ready,
    // register it as an Asset (same table the fal webhook writes to) so the
    // UI renders it identically to fal-generated videos.
    const memRaw = (scene.memoryContext as Record<string, unknown> | null) ?? {};
    const pending = memRaw.pendingVideoJob as undefined | { provider: "openai" | "google" | "higgsfield"; jobId: string; model: string; durationSeconds: number; submittedAt?: string; kind?: string; sourceAssetId?: string };
    let videoProgress: number | null = null; // 0-100 real progress from API
    if (pending?.jobId) {
      try {
        let proxyUrl: string | null = null;
        let failedReason: string | null = null;
        if (pending.provider === "google") {
          const r = await pollVeoOperation(pending.jobId);
          if (r.done && r.videoUri) proxyUrl = `/api/v1/videos/veo-proxy?uri=${encodeURIComponent(r.videoUri)}`;
          else if (r.done && r.error) failedReason = r.error;
        } else if (pending.provider === "openai") {
          const r = await pollSoraVideo(pending.jobId);
          if (r.status === "completed") proxyUrl = `/api/v1/videos/sora-proxy?id=${encodeURIComponent(pending.jobId)}`;
          else if (r.status === "failed") failedReason = "sora job failed";
          else if (typeof r.progress === "number") videoProgress = r.progress;
        } else if (pending.provider === "higgsfield") {
          const { pollHiggsVideo } = await import("@/lib/providers/higgsfield");
          const r = await pollHiggsVideo(pending.jobId);
          if (r.status === "completed" && r.videoUrl) proxyUrl = r.videoUrl;
          else if (r.status === "failed") failedReason = r.error ?? "higgsfield job failed";
          else if (typeof r.progress === "number") videoProgress = r.progress;
        }
        if (proxyUrl) {
          const projectIdForAsset = (await prisma.episode.findUniqueOrThrow({
            where: { id: scene.episodeId! },
            select: { season: { select: { series: { select: { projectId: true } } } } },
          })).season.series.projectId;
          // Compute cost so the scene "סה"כ" subtitle populates without a
          // CostEntry round-trip. Sora $0.10/s (sora-2) or $0.30/s (sora-2-pro);
          // VEO variable — we pick priceSora for openai and fall back to 0 for
          // google (the fal path stamps its own cost via webhook).
          let costUsd: number | null = null;
          if (pending.provider === "openai") {
            const rate = pending.model === "sora-2-pro" ? 0.30 : 0.10;
            costUsd = +(rate * (pending.durationSeconds ?? 0)).toFixed(4);
          } else if (pending.provider === "higgsfield") {
            const rate = /kling/.test(pending.model) ? 0.06 : 0.05;
            costUsd = +(rate * (pending.durationSeconds ?? 0)).toFixed(4);
          }
          await prisma.asset.create({
            data: {
              projectId: projectIdForAsset, entityType: "SCENE", entityId: scene.id, assetType: "VIDEO",
              fileUrl: proxyUrl, mimeType: "video/mp4", status: "READY",
              metadata: {
                provider: pending.provider,
                model: pending.model,
                durationSeconds: pending.durationSeconds,
                costUsd,
                ...(pending.kind ? { kind: pending.kind } : {}),
                ...(pending.sourceAssetId ? { sourceAssetId: pending.sourceAssetId } : {}),
                ...(pending.provider === "openai" && pending.jobId ? { soraVideoId: pending.jobId } : {}),
              } as object,
            },
          });
          const { pendingVideoJob: _p, ...rest } = memRaw;
          await prisma.scene.update({ where: { id: scene.id }, data: { status: "VIDEO_REVIEW", memoryContext: rest as object } });
          await (prisma as any).sceneLog.create({
            data: {
              sceneId: scene.id,
              action: "video_ready",
              actor: "system:poll",
              actorName: pending.provider === "openai" ? "Sora 2" : "Google VEO",
              details: { provider: pending.provider, model: pending.model, durationSeconds: pending.durationSeconds, jobId: pending.jobId },
            },
          }).catch(() => {});
          scene = await prisma.scene.findUnique({
            where: { id: params.id },
            include: { frames: { orderBy: { orderIndex: "asc" } }, criticReviews: true, comments: true },
          });
          if (!scene) return ok(null);
        } else if (failedReason) {
          const { pendingVideoJob: _p, ...rest } = memRaw;
          await prisma.scene.update({
            where: { id: scene.id },
            data: { status: "STORYBOARD_REVIEW", memoryContext: { ...rest, lastVideoError: failedReason } as object },
          });
        }
      } catch (e) { console.warn("[scene-poll]", (e as Error).message); }
    }

    if (!scene) return ok(null);
    const frameIds = scene.frames.map((f) => f.id);
    const mem = (scene.memoryContext as { characters?: string[] } | null) ?? {};
    const names = (mem.characters ?? []).map((n) => n.toLowerCase().trim());

    // Parallelize all secondary lookups — was causing cold-start timeouts when run serially
    const [frameCosts, videos, epRow] = await Promise.all([
      frameIds.length > 0
        ? prisma.costEntry.findMany({ where: { entityType: "FRAME", entityId: { in: frameIds } }, orderBy: { createdAt: "desc" } })
        : Promise.resolve([] as Awaited<ReturnType<typeof prisma.costEntry.findMany>>),
      // Pull all videos; sort primary first (metadata.isPrimary), then newest.
      // Done in JS because Prisma can't sort by a JSON field portably.
      prisma.asset.findMany({
        where: { entityType: "SCENE", entityId: params.id, assetType: "VIDEO", status: "READY" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, fileUrl: true, createdAt: true, metadata: true },
      }).then((rows) => rows.sort((a, b) => {
        const aP = (a.metadata as { isPrimary?: boolean } | null)?.isPrimary ? 1 : 0;
        const bP = (b.metadata as { isPrimary?: boolean } | null)?.isPrimary ? 1 : 0;
        if (aP !== bP) return bP - aP;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })),
      scene.episodeId
        ? prisma.episode.findUnique({
            where: { id: scene.episodeId },
            select: { season: { select: { series: { select: { projectId: true } } } } },
          })
        : Promise.resolve(null),
    ]);

    const acc = new Map<string, { latest?: typeof frameCosts[number]; total: number; count: number }>();
    for (const c of frameCosts) {
      const cur = acc.get(c.entityId) ?? { total: 0, count: 0 };
      if (!cur.latest) cur.latest = c;
      cur.total += c.totalCost;
      cur.count++;
      acc.set(c.entityId, cur);
    }
    const framesWithCost = scene.frames.map((f) => {
      const ci = acc.get(f.id);
      const latestMeta = (ci?.latest?.meta as { model?: string } | null) ?? {};
      return {
        ...f,
        cost: ci?.latest ? +ci.latest.totalCost.toFixed(4) : 0,
        totalSpent: ci ? +ci.total.toFixed(4) : 0,
        regenCount: ci ? ci.count : 0,
        model: latestMeta.model ?? (ci?.latest?.description?.includes("nano-banana") ? "nano-banana" : undefined),
        lastChargedAt: ci?.latest?.createdAt ?? null,
      };
    });

    let sceneCharacters: unknown[] = [];
    const projectId = epRow?.season.series.projectId;
    if (projectId) {
      // Union of three signals:
      //   1. memoryContext.characters (what the generator/director explicitly marked)
      //   2. EpisodeCharacter links (who appears in this episode per the cast)
      //   3. Names mentioned in scriptText (SPEAKER: lines, ALL CAPS tokens)
      const fromScript = new Set<string>();
      if (scene.scriptText) {
        for (const line of scene.scriptText.split(/\n+/)) {
          const m = line.match(/^([A-Z][A-Z \-.']{1,40})\s*(?:\(|:)/);
          if (m) fromScript.add(m[1].trim().toLowerCase());
          // Also catch any ALL-CAPS tokens 3+ chars (names like MIRA, MAYA)
          for (const tok of line.match(/\b[A-Z][A-Z]{2,}\b/g) ?? []) {
            if (tok.length <= 30) fromScript.add(tok.toLowerCase());
          }
        }
      }

      const epChars = await prisma.episodeCharacter.findMany({
        where: { episodeId: scene.episodeId ?? "__none__" },
        include: { character: { include: { media: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true, fileUrl: true, mediaType: true } } } } },
      });

      const candidateNames = new Set<string>([
        ...names,
        ...epChars.map((ec) => ec.character.name.toLowerCase().trim()),
        ...fromScript,
      ]);

      const all = await prisma.character.findMany({
        where: { projectId },
        include: { media: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true, fileUrl: true, mediaType: true } } },
      });
      const matched = all.filter((c) => {
        const n = c.name.toLowerCase().trim();
        const firstName = n.split(" ")[0];
        if (candidateNames.has(n)) return true;
        for (const cand of candidateNames) {
          if (n === cand) return true;
          if (n.startsWith(cand + " ")) return true;
          if (cand === firstName) return true;
          if (cand.startsWith(firstName + " ")) return true;
        }
        return false;
      });
      sceneCharacters = matched;

      // Names mentioned in script/memoryContext that DON'T have a Character row yet
      const matchedNames = new Set(matched.flatMap((c) => [c.name.toLowerCase().trim(), c.name.toLowerCase().split(" ")[0]]));
      const missing = [...fromScript, ...names].filter((n) => !matchedNames.has(n) && n.length >= 3);
      ;(sceneCharacters as { scriptOnlyNames?: string[] } & object[]).push(...[]); // noop to keep variable type
      (scene as unknown as { _scriptMentionsNotInCast: string[] })._scriptMentionsNotInCast = [...new Set(missing)];
    }

    const scriptMentionsNotInCast = (scene as unknown as { _scriptMentionsNotInCast?: string[] })._scriptMentionsNotInCast ?? [];
    // Piggyback logs on the main GET so the log modal opens instantly
    // (no second round-trip). Limited to last 50 entries.
    const activityLogs = await (prisma as any).sceneLog.findMany({
      where: { sceneId: scene.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []);
    return ok({ ...scene, frames: framesWithCost, sceneCharacters, videos, scriptMentionsNotInCast, activityLogs, videoProgress });
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertSceneInOrg(params.id, ctx.organizationId);
    return ok(await prisma.scene.update({ where: { id: params.id }, data: SceneUpdate.parse(await req.json()) }));
  } catch (e) { return handleError(e); }
}
