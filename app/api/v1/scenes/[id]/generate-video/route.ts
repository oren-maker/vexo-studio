import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { CostStrategy } from "@/lib/services";
import { submitVideo, type VideoModel } from "@/lib/providers/fal";
import { submitSoraVideo, type SoraModel, type SoraSeconds } from "@/lib/providers/openai-sora";
import { submitVeoVideo, type GoogleVeoModel } from "@/lib/providers/google-veo";
import { fetchReferencePrompts, buildReferenceContext } from "@/lib/providers/vexo-learn";
import { generateSoundNotes } from "@/lib/sound-notes";
import { buildCharacterSheet, describeSheetLayout } from "@/lib/character-sheet";
import { put as putBlob } from "@vercel/blob";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  videoModel: z.enum([
    "seedance", "kling", "veo3-pro", "veo3-fast", "vidu-q1",
    "sora-2", "sora-2-pro",
    "google-veo-3.1-fast-generate-preview",
    "google-veo-3.1-generate-preview",
    "google-veo-3.1-lite-generate-preview",
  ]).default("sora-2"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  durationSeconds: z.number().int().min(1).max(20).default(20),
}).partial();

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    const scene = await prisma.scene.findFirst({
      where: { id: params.id },
      include: {
        frames: { orderBy: { orderIndex: "asc" } },
        episode: {
          include: {
            season: { select: { seasonNumber: true } },
            characters: { include: { character: { include: { media: { orderBy: { createdAt: "asc" } } } } } },
          },
        },
      },
    });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
    // Allow STORYBOARD_REVIEW too — auto-approve workflow
    // Also allow VIDEO_GENERATING — a previous attempt may have failed silently
    // (lost fal webhook, dropped connection) and the user wants to retry instead
    // of being permanently stuck. The new submission overwrites the scene's
    // active job.
    if (!["STORYBOARD_APPROVED", "STORYBOARD_REVIEW", "VIDEO_REVIEW", "VIDEO_GENERATING"].includes(scene.status)) {
      throw Object.assign(new Error(`storyboard status is ${scene.status}, expected STORYBOARD_APPROVED`), { statusCode: 409 });
    }

    const estimate = await CostStrategy.estimateSceneVideoCost(scene.id);
    await prisma.scene.update({ where: { id: scene.id }, data: { status: "VIDEO_GENERATING" } });

    if (!process.env.FAL_API_KEY) {
      // Fallback: skip generation, mark for review
      await prisma.scene.update({ where: { id: scene.id }, data: { status: "VIDEO_REVIEW" } });
      return ok({ jobId: `stub-${Date.now()}`, estimate, note: "FAL_API_KEY not set; status flipped without generation." });
    }

    // Build the video prompt from ALL available signals:
    //   1. Director Sheet (8-section bible) if present
    //   2. Raw script — so dialogue + actions feed the model verbatim
    //   3. Character appearance + name for every character in the scene
    //   4. Director's manual notes (scene.memoryContext.directorNotes)
    //   5. First storyboard frame's prompt as the opening shot
    //   6. Reference image URLs (characters + first frame) sent as image_urls
    const mem = (scene.memoryContext as {
      directorSheet?: { style: string; scene: string; character: string; shots: string; camera: string; effects: string; audio: string; technical: string };
      directorNotes?: string;
      characters?: string[];
      soundNotes?: string;
    } | null) ?? {};

    // If sound notes are missing, generate them inline before submitting —
    // an audio-capable video model needs the sound brief in the prompt or
    // it'll guess music/SFX. ~3-5s extra; well within the 60s budget.
    if (!mem.soundNotes && scene.scriptText) {
      try {
        const sn = await generateSoundNotes({
          episodeNumber: scene.episode?.episodeNumber,
          sceneNumber: scene.sceneNumber,
          sceneTitle: scene.title,
          summary: scene.summary,
          scriptText: scene.scriptText,
          directorSheetAudio: mem.directorSheet?.audio,
          directorNotes: mem.directorNotes,
        });
        if (sn) {
          mem.soundNotes = sn;
          await prisma.scene.update({
            where: { id: scene.id },
            data: { memoryContext: { ...(scene.memoryContext as object ?? {}), soundNotes: sn } as object },
          }).catch(() => {});
        }
      } catch { /* not fatal — proceed without */ }
    }
    const sheet = mem.directorSheet;
    const sceneNames = (mem.characters ?? []).map((n) => n.toLowerCase().trim());
    const episodeChars = scene.episode?.characters.map((ec) => ec.character) ?? [];
    const inScene = sceneNames.length > 0
      ? episodeChars.filter((c) => sceneNames.includes(c.name.toLowerCase().trim()))
      : episodeChars;

    const characterBlock = inScene.length > 0
      ? "[Cast]\n" + inScene.map((c) => `- ${c.name}${c.roleType ? ` (${c.roleType})` : ""}: ${(c.appearance ?? "").slice(0, 220)}${c.wardrobeRules ? ` | wardrobe: ${c.wardrobeRules.slice(0, 150)}` : ""}`).join("\n")
      : "";

    const firstFrame = scene.frames[0];
    const characterRefImgs = inScene
      .map((c) => c.media.find((m) => (m.metadata as { angle?: string } | null)?.angle === "front") ?? c.media[0])
      .map((m) => m?.fileUrl)
      .filter((u): u is string => !!u);
    // Prefer the first storyboard frame as the starting image. If no frame
    // image exists yet, fall back to the first character's front-angle image —
    // still guarantees identity lock via image-to-video.
    const firstFrameImg = (firstFrame?.approvedImageUrl || firstFrame?.generatedImageUrl) || characterRefImgs[0];

    // If we have a starting frame (i2v mode), the model sees the image already —
    // what it needs is a CONCISE action description (what happens in the next
    // few seconds starting from that frame), not a cinematography bible.
    // In t2v mode we send the full director sheet so it has everything.
    const willUseI2V = !!(firstFrame?.approvedImageUrl || firstFrame?.generatedImageUrl) || characterRefImgs.length > 0;

    // Parse dialogue into VEO 3-friendly format: speaker, tone hint (from neighboring action), and the line in quotes.
    // VEO 3 generates speech when prompts use the pattern: `<Name> says: "<line>"`
    // Pull SPEAKER:line pairs from script (handles both `MIRA:` and `MIRA (whispering):` patterns).
    function parseDialogue(text: string | null): { veoFormatted: string; rawList: string } {
      if (!text) return { veoFormatted: "", rawList: "" };
      const lines = text.split(/\n+/);
      const dlg: Array<{ speaker: string; mod?: string; line: string }> = [];
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^([A-Z][A-Z .'-]{1,30})\s*(?:\(([^)]+)\))?\s*[:：]\s*(.*)$/);
        if (!m) continue;
        let line = (m[3] ?? "").trim();
        // Some scripts put line on next row
        if (!line && i + 1 < lines.length && !/^[A-Z][A-Z .'-]{1,30}\s*[:(]/.test(lines[i + 1])) {
          line = lines[i + 1].trim();
        }
        if (line) dlg.push({ speaker: m[1].trim(), mod: m[2]?.trim(), line: line.replace(/^["']|["']$/g, "") });
      }
      const formatted = dlg.slice(0, 12).map((d) =>
        `${toTitle(d.speaker)}${d.mod ? ` (${d.mod})` : ""} says, with synced lip movements: "${d.line}"`,
      ).join(" ");
      const raw = dlg.slice(0, 12).map((d) => `${d.speaker}: ${d.line}`).join("\n");
      return { veoFormatted: formatted, rawList: raw };
    }
    function toTitle(s: string) { return s.split(" ").map((w) => w[0] + w.slice(1).toLowerCase()).join(" "); }
    const { veoFormatted: veoDialogue, rawList: dialogueLines } = parseDialogue(scene.scriptText);

    // AUDIO block at the TOP — VEO 3 weighs earlier tokens more and often
    // omits sound when dialogue/music instructions are buried in a long prompt.
    const audioBlock = [
      veoDialogue && `Spoken dialogue (generate audible speech with synced lip movement, clear intelligible voices): ${veoDialogue}`,
      sheet?.audio && `Music and ambience: ${sheet.audio}`,
      mem.soundNotes && `Sound design: ${mem.soundNotes.slice(0, 800)}`,
      "Include clearly audible dialogue, ambient room tone, footsteps, breathing, and appropriate background music.",
    ].filter(Boolean).join(" ");

    // First scene of every episode gets an auto title card: "Season N Episode M"
    // overlaid in the opening ~1.5 seconds, then fades out. Also spoken by narrator.
    const isFirstScene = scene.sceneNumber === 1;
    const sNum = scene.episode?.season?.seasonNumber;
    const eNum = scene.episode?.episodeNumber;
    const titleCardBlock = isFirstScene && sNum != null && eNum != null
      ? `EPISODE TITLE CARD (first 1.5 seconds only): Overlay large clean white sans-serif text reading "SEASON ${sNum} · EPISODE ${eNum}" centered on screen with 15% safe margins, then fade out smoothly before the action starts. A warm narrator voice reads "Season ${sNum}, Episode ${eNum}" in sync with the on-screen text.`
      : "";

    const basePrompt = willUseI2V
      ? [
          // 1. Audio comes first so VEO 3 doesn't skip it.
          `AUDIO: ${audioBlock}`,
          titleCardBlock,
          // 2. Photorealism + identity lock
          `Continue from the starting image as a live-action photorealistic film. Real human actors, real skin pores, real eyes, no animation or CGI look.`,
          inScene.length > 0 && `On screen: ${inScene.map((c) => c.name).join(", ")} — keep their faces, hair, wardrobe EXACTLY as in the image, no drift.`,
          // 3. Action
          scene.summary && `Action: ${scene.summary}`,
          sheet?.camera && `Camera: ${sheet.camera}`,
          // 4. Script for full context
          scene.scriptText && `Full script:\n${scene.scriptText.slice(0, 800)}`,
          mem.directorNotes && `Director notes (highest priority): ${mem.directorNotes.slice(0, 400)}`,
          sheet?.effects && sheet.effects.toLowerCase() !== "none" && `Effects: ${sheet.effects}`,
        ].filter(Boolean).join("\n\n")
      : sheet
      ? [
          // AUDIO first here too
          `AUDIO: ${audioBlock}`,
          titleCardBlock,
          `[Style] ${sheet.style} — Photorealistic live-action film. Real human actors with real skin, real eyes. NO cartoon, NO 3D render, NO illustration.`,
          `[Scene] ${sheet.scene}`,
          `[Character] ${sheet.character}`,
          characterBlock,
          `[Camera] ${sheet.camera}`,
          `[Shots] ${sheet.shots}`,
          `[Effects] ${sheet.effects}`,
          `[Technical] ${sheet.technical} · 24fps · real physical lighting, film grain.`,
          scene.scriptText && `[Script]\n${scene.scriptText.slice(0, 1200)}`,
          mem.directorNotes && `[Director notes]\n${mem.directorNotes.slice(0, 600)}`,
        ].filter(Boolean).join("\n\n")
      : [
          `AUDIO: ${audioBlock}`,
          titleCardBlock,
          scene.title && `Title: ${scene.title}`,
          scene.summary && `Summary: ${scene.summary}`,
          characterBlock,
          scene.scriptText && `Script:\n${scene.scriptText}`,
          mem.directorNotes && `Director notes:\n${mem.directorNotes}`,
          "Photorealistic live-action film, real actors, 24fps, real physical lighting. NO cartoon, NO illustration.",
        ].filter(Boolean).join("\n\n");

    // Pull Seedance reference prompts to guide tone/level of detail
    const refQuery = [scene.title, scene.summary].filter(Boolean).join(" ");
    const refs = await fetchReferencePrompts(refQuery, 3);
    const referenceCtx = buildReferenceContext(refs);
    // Every scene ends with a gentle fade-out to black — smoother transitions
    // when clips are later merged into a full episode.
    const fadeDirective = "END OF SCENE: in the final 0.5 seconds only, quickly and smoothly fade to black — keep the action running until that point.";
    const prompt = [basePrompt, referenceCtx, fadeDirective].filter(Boolean).join("\n\n");

    // Build webhook URL pointing back at us
    const duration = body.durationSeconds ?? 5;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`;
    const webhookUrl = `${baseUrl}/api/v1/webhooks/incoming/fal?sceneId=${scene.id}&duration=${duration}&model=${body.videoModel ?? "veo3-fast"}`;

    const modelKey = body.videoModel ?? "veo3-fast";
    const isSora = modelKey === "sora-2" || modelKey === "sora-2-pro";
    const isGoogleVeo = modelKey.startsWith("google-veo-");
    const isFal = !isSora && !isGoogleVeo;

    let jobId: string;
    let provider: "fal" | "openai" | "google";
    let displayModel: string;

    // Shared character-sheet logic — every video model has trouble juggling
    // 5 separate character portraits, so when 2+ characters appear in the
    // scene we pre-compose them into a single 1280x720 reference image and
    // describe the layout in the prompt. Sora, Google VEO, and fal all use
    // this same pre-baked sheet.
    const sheetCast = inScene
      .map((c) => {
        const front = c.media.find((m) => (m.metadata as { angle?: string } | null)?.angle === "front") ?? c.media[0];
        return front?.fileUrl ? { name: c.name, portraitUrl: front.fileUrl } : null;
      })
      .filter((x): x is { name: string; portraitUrl: string } => !!x);

    let compositeSheetUrl: string | null = null;
    let identityClause = "";
    if (sheetCast.length >= 2) {
      try {
        const sheetBuf = await buildCharacterSheet(sheetCast);
        const blob = await putBlob(`character-sheets/${scene.id}-${Date.now()}.jpg`, sheetBuf, {
          access: "public", contentType: "image/jpeg", addRandomSuffix: true,
        });
        compositeSheetUrl = blob.url;
        identityClause = describeSheetLayout(sheetCast);
      } catch (e) {
        console.warn("[character-sheet] build failed, falling back to single portraits:", (e as Error).message);
      }
    } else if (sheetCast.length === 1) {
      identityClause = describeSheetLayout(sheetCast);
    }

    try {
      if (isSora) {
        // Bucket onto the Sora API enum (4/8/12/16/20). Anything over 20s
        // would need Storyboard chaining, which is Web-only — we cap here.
        const sec: SoraSeconds = duration <= 5 ? "4" : duration <= 9 ? "8" : duration <= 13 ? "12" : duration <= 17 ? "16" : "20";
        const size = body.aspectRatio === "9:16" ? "720x1280" : "1280x720";
        const soraSeed = compositeSheetUrl ?? sheetCast[0]?.portraitUrl ?? characterRefImgs[0] ?? firstFrameImg ?? undefined;
        const soraPrompt = identityClause ? `${identityClause}\n\n${prompt}` : prompt;
        const s = await submitSoraVideo({
          prompt: soraPrompt, model: modelKey as SoraModel, seconds: sec, size,
          imageUrl: soraSeed,
        });
        jobId = s.id; provider = "openai"; displayModel = modelKey;
      } else if (isGoogleVeo) {
        const veoModel = modelKey.replace(/^google-/, "") as GoogleVeoModel;
        const veoPrompt = identityClause ? `${identityClause}\n\n${prompt}`.slice(0, 1000) : prompt.slice(0, 1000);
        // If we built a composite sheet, send it as the SOLE reference (1 image
        // with N faces beats N images of 1 face each). Else fall back to up
        // to 3 individual portraits.
        const veoRefs = compositeSheetUrl ? [compositeSheetUrl] : characterRefImgs.slice(0, 3);
        const s = await submitVeoVideo({
          prompt: veoPrompt,
          model: veoModel,
          durationSeconds: duration,
          aspectRatio: (body.aspectRatio ?? "16:9") as "16:9" | "9:16" | "1:1",
          imageUrl: firstFrameImg ?? compositeSheetUrl ?? undefined,
          referenceImageUrls: veoRefs,
        });
        jobId = s.operationName; provider = "google"; displayModel = veoModel;
      } else {
        const falPrompt = identityClause ? `${identityClause}\n\n${prompt}` : prompt;
        // Same logic for fal — composite when available, else individual portraits.
        // vidu-q1 is the exception: it actually accepts 7 separate refs cleanly.
        const falRefs = compositeSheetUrl
          ? [compositeSheetUrl]
          : (modelKey === "vidu-q1" ? characterRefImgs.slice(0, 7) : characterRefImgs.slice(0, 3));
        const s = await submitVideo({
          prompt: falPrompt,
          model: modelKey as VideoModel,
          durationSeconds: duration,
          aspectRatio: body.aspectRatio,
          webhookUrl,
          imageUrl: firstFrameImg ?? compositeSheetUrl ?? undefined,
          referenceImageUrls: falRefs,
        });
        jobId = s.requestId; provider = "fal"; displayModel = s.model;
      }
    } catch (submitErr) {
      await prisma.scene.update({ where: { id: scene.id }, data: { status: "STORYBOARD_REVIEW" } }).catch(() => {});
      throw Object.assign(new Error(`${provider! ?? "provider"} submit failed: ${(submitErr as Error).message}`), { statusCode: 502 });
    }

    // Track pending provider-side jobs (Sora/Google) in scene.memoryContext —
    // the fal path writes through a webhook and doesn't need this; for Sora
    // and Google VEO we poll on every scene GET until the video is ready.
    if (!isFal) {
      const existing = (scene.memoryContext as Record<string, unknown> | null) ?? {};
      await prisma.scene.update({
        where: { id: scene.id },
        data: {
          memoryContext: {
            ...existing,
            pendingVideoJob: { provider, jobId, model: displayModel, durationSeconds: duration, submittedAt: new Date().toISOString() },
          },
        },
      });
    }

    const projectId = (await prisma.episode.findUniqueOrThrow({ where: { id: scene.episodeId! }, include: { season: { include: { series: true } } } })).season.series.projectId;
    if (isFal) {
      await prisma.lipSyncJob.create({
        data: { entityType: "SCENE", entityId: scene.id, sceneId: scene.id, status: "PENDING" },
      }).catch(() => {});
    }

    return ok({ jobId, estimate, model: displayModel, provider, framework: isFal ? "fal-queue" : `${provider}-poll`, projectId });
  } catch (e) { return handleError(e); }
}
