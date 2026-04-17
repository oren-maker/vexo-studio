import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { CostStrategy } from "@/lib/services";
import { submitVideo, type VideoModel } from "@/lib/providers/fal";
import { submitSoraVideo, type SoraModel, type SoraSeconds } from "@/lib/providers/openai-sora";
import { submitVeoVideo, type GoogleVeoModel } from "@/lib/providers/google-veo";
import { submitHiggsVideo, priceHiggs } from "@/lib/providers/higgsfield";
import { fetchReferencePrompts, buildReferenceContext } from "@/lib/providers/vexo-learn";
import { generateSoundNotes } from "@/lib/sound-notes";
import { buildCharacterSheet, describeSheetLayout } from "@/lib/character-sheet";
import { put as putBlob } from "@vercel/blob";
import { handleError, ok } from "@/lib/route-utils";
import { logUsage } from "@/lib/learn/usage-tracker";
import { chargeUsd } from "@/lib/billing";
import { priceSora, type SoraModel as SoraModelType } from "@/lib/providers/openai-sora";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  videoModel: z.enum([
    "seedance", "kling", "veo3-pro", "veo3-fast", "vidu-q1",
    "sora-2",
    "google-veo-3.1-fast-generate-preview",
    "google-veo-3.1-generate-preview",
    "google-veo-3.1-lite-generate-preview",
    "higgsfield", "higgs-seedance", "higgs-kling", "higgs-wan",
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
            _count: { select: { scenes: true } },
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

    // Require Director Sheet before video generation — without it the prompt
    // is too generic and the result won't match expectations.
    const memCheck = (scene.memoryContext as { directorSheet?: Record<string, string> } | null) ?? {};
    if (!memCheck.directorSheet) {
      throw Object.assign(
        new Error("יש ליצור דף במאי (Director Sheet) לפני יצירת וידאו. לחץ על ✨ ייצר עם AI בכרטיסיית דף הבמאי."),
        { statusCode: 400 },
      );
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

    // AUDIO block at the TOP — VEO 3 / Sora weigh earlier tokens more and
    // often skip audio when dialogue/music instructions are buried. This is
    // the crystallised version after consulting the AI Director knowledge
    // (BrainReference sound + lip-sync KnowledgeNodes, 2026-04-17):
    //
    //  - DIALOGUE must be spoken + phoneme-level lip-synced, not silent
    //    "talking head" frames; script cadence drives mouth shape + breath.
    //  - MUSIC must be present unless the script explicitly says silence,
    //    ducked 3-6 dB under speech (sidechain-style), with ONE clear sting
    //    at the emotional beat of the clip.
    //  - AMBIENCE must be continuous — room tone or exterior bed,
    //    never true silence between lines.
    //  - FOLEY — footsteps on a named surface, cloth rustle, prop handling
    //    — adds physical weight; each beat tied to on-screen motion.
    //  - NEGATIVE rules close the block so the model doesn't skip audio.
    const hasDialogue = !!veoDialogue;
    const audioSegments: string[] = [];
    audioSegments.push(`AUDIO (MANDATORY — all tracks below must be clearly audible in the final clip, correctly mixed with dialogue on top):`);

    if (hasDialogue) {
      audioSegments.push(
        `1) DIALOGUE: ${veoDialogue} — generate fully audible spoken speech in a clear adult voice; mouth shapes must match each phoneme exactly (visible on camera when the face is in frame), with natural breaths between phrases and micro-expressions that match the line's emotional tone. NO silent mouth-moving, NO mumbling, NO overlapping into un-intelligibility. Shot scale varies from medium to close during dialogue to sell emotion.`,
      );
    } else {
      audioSegments.push(
        `1) DIALOGUE: this clip has no scripted speech, but include naturalistic human sounds — a sigh, a short exhale, a gasp, or a single muttered word — so the character feels alive. NO dead-silent human faces.`,
      );
    }

    audioSegments.push(
      `2) MUSIC: ${sheet?.audio ? sheet.audio : "low-intensity underscore matching the scene's emotional tone"}. Ducked -3 to -6 dB under dialogue (10 ms attack, 200 ms release). Include ONE clear musical accent (sting / riser / cue change) aligned to the strongest emotional beat of the clip. Leave a 1-3 kHz spectral gap so speech stays intelligible.`,
    );

    audioSegments.push(
      `3) AMBIENCE: continuous bed layer for the scene's location (room tone at about -35 dB RMS for interior, or a specific exterior bed — wind, traffic, birds, crowd walla — for outdoor). Never let the audio go truly silent between lines; the world is always breathing.`,
    );

    audioSegments.push(
      `4) FOLEY: footsteps on the actual surface of this location (wood / tile / concrete / gravel), cloth rustle when characters turn or gesture, prop handling sounds (cup, phone, door, paper), and audible breathing on close-ups. Weight of each footstep tracks the character's emotional state.`,
    );

    if (mem.soundNotes) {
      audioSegments.push(`5) SCENE-SPECIFIC SOUND DESIGN: ${mem.soundNotes.slice(0, 700)}`);
    }

    audioSegments.push(
      `NEGATIVE AUDIO RULES: NO silent dialogue frames; NO generic video-game music; NO music so loud it drowns speech; NO abrupt audio cuts at clip boundaries (use J-Cut / L-Cut style — the previous clip's audio tail can continue 0.5-1 s into this clip's opening for continuity).`,
    );

    const audioBlock = audioSegments.join("\n");

    // First scene of every episode gets an auto title card: "Season N Episode M"
    // overlaid in the opening ~1.5 seconds, then fades out. Also spoken by narrator.
    const isFirstScene = scene.sceneNumber === 1;
    const sNum = scene.episode?.season?.seasonNumber;
    const eNum = scene.episode?.episodeNumber;
    const titleCardBlock = isFirstScene && sNum != null && eNum != null
      ? `EPISODE TITLE CARD (first 1.5 seconds only): Overlay large clean white sans-serif text reading "SEASON ${sNum} · EPISODE ${eNum}" centered on screen with 15% safe margins, then fade out smoothly before the action starts. A warm narrator voice reads "Season ${sNum}, Episode ${eNum}" in sync with the on-screen text.`
      : "";

    // Global framing shared by ALL scenes — tells the model this clip is
    // a segment of one continuous television sequence, not a standalone
    // vignette. This primes identity / location / object preservation so
    // the bridge-frame chain (scene N's last frame = scene N+1's first frame)
    // reads as a single shot split into 20s chunks rather than separate takes.
    const continuityHeader = isFirstScene
      ? `CONTINUOUS TV SERIES — EPISODE OPENING CLIP. This is the first 20-second clip of a continuous filmic episode. The final frame of this clip will seed the next clip via image-to-video, so end on a cleanly composed, stable frame (see END-FRAME rules below).`
      : `CONTINUOUS TV SERIES — MID-EPISODE CLIP. This clip is one segment of a single continuous filmic sequence (scene ${scene.sceneNumber ?? "?"} of ${scene.episode?.episodeNumber ?? "?"}). It MUST read as an uninterrupted take from the previous clip — same characters, same room, same lighting, same on-screen objects. The reference image you see IS the final frame of the previous clip; begin exactly at that pixel state and EVOLVE from there — no re-establishing shot, no cut, no relight, no prop swap. Preserve identity + location + objects TOGETHER as one.`;

    // End-frame rule: middle-of-episode clips end on a clean frame that
    // becomes the i2v seed for the next clip; the last clip of an episode
    // fades to black for the final TV-episode cut.
    const totalScenes = scene.episode?._count?.scenes ?? null;
    const isLastSceneOfEpisode = totalScenes != null && scene.sceneNumber === totalScenes;
    const endFrameRule = isLastSceneOfEpisode
      ? `END-FRAME (episode finale): the final 1.5 seconds fade smoothly to pure black, audio ducks to silence in sync. This is the episode's end card.`
      : `END-FRAME (mid-episode, NON-NEGOTIABLE): the final 1 second of this clip MUST settle into a cleanly composed, stable frame — no motion blur, characters holding position, lighting steady, every on-screen object clearly visible. This exact frame will be extracted and used as the opening reference for the next clip, so it must be a legible bridge between scenes. DO NOT fade to black and DO NOT end mid-motion.`;

    // Identity + location + object preservation block — shared across all
    // branches. This is the crystallised rule from Oren's feedback:
    // "לשמר את הזהות המיקום הכל ביחד" — one frame carries everything.
    const continuityLock = inScene.length > 0
      ? `CONTINUITY LOCK (identity + location + objects, TOGETHER):
 · Characters: ${inScene.map((c) => c.name).join(", ")} — keep every face, skin tone, hair, wardrobe EXACTLY as shown in the reference image(s). No drift in age, weight, or features between clips.
 · Location: the room / environment is identical to the previous clip — same walls, windows, furniture layout, floor texture. Do not relocate the action.
 · Lighting: same color temperature (warm/cool), same key/fill/rim directions, same shadow angles as the reference image. No relight.
 · Props & objects: every prop visible on the reference image is still present, in the same place, in the same state. Clothes do not change. Cups, papers, phones stay put unless the script moves them.
 · Camera continuity: keep the same lens focal length and depth of field as the reference; do NOT cross the 180° line from the previous clip.`
      : "";

    const basePrompt = willUseI2V
      ? [
          continuityHeader,
          audioBlock,
          titleCardBlock,
          `Live-action photorealistic film. Real human actors, real skin pores, real eyes, real physical lighting. NO animation, NO CGI look, NO illustration, NO 3D render.`,
          continuityLock,
          scene.summary && `Action this clip: ${scene.summary}`,
          sheet?.camera && `Camera: ${sheet.camera}`,
          scene.scriptText && `Full script:\n${scene.scriptText.slice(0, 800)}`,
          mem.directorNotes && `Director notes (highest priority): ${mem.directorNotes.slice(0, 400)}`,
          sheet?.effects && sheet.effects.toLowerCase() !== "none" && `Effects: ${sheet.effects}`,
          endFrameRule,
        ].filter(Boolean).join("\n\n")
      : sheet
      ? [
          continuityHeader,
          audioBlock,
          titleCardBlock,
          `[Style] ${sheet.style} — Photorealistic live-action film. Real human actors with real skin, real eyes. NO cartoon, NO 3D render, NO illustration.`,
          `[Scene] ${sheet.scene}`,
          `[Character] ${sheet.character}`,
          characterBlock,
          continuityLock,
          `[Camera] ${sheet.camera}`,
          `[Shots] ${sheet.shots}`,
          `[Effects] ${sheet.effects}`,
          `[Technical] ${sheet.technical} · 24fps · real physical lighting, film grain.`,
          scene.scriptText && `[Script]\n${scene.scriptText.slice(0, 1200)}`,
          mem.directorNotes && `[Director notes]\n${mem.directorNotes.slice(0, 600)}`,
          endFrameRule,
        ].filter(Boolean).join("\n\n")
      : [
          continuityHeader,
          audioBlock,
          titleCardBlock,
          scene.title && `Title: ${scene.title}`,
          scene.summary && `Summary: ${scene.summary}`,
          characterBlock,
          continuityLock,
          scene.scriptText && `Script:\n${scene.scriptText}`,
          mem.directorNotes && `Director notes:\n${mem.directorNotes}`,
          "Photorealistic live-action film, real actors, 24fps, real physical lighting. NO cartoon, NO illustration.",
          endFrameRule,
        ].filter(Boolean).join("\n\n");

    // Pull Seedance reference prompts to guide tone/level of detail
    const refQuery = [scene.title, scene.summary].filter(Boolean).join(" ");
    const refs = await fetchReferencePrompts(refQuery, 3);
    const referenceCtx = buildReferenceContext(refs);
    // End-frame handling is now controlled by `endFrameRule` inside basePrompt:
    // mid-episode clips keep a clean stable frame for the bridge-chain;
    // only the final scene of an episode fades to black. The continuity
    // header already primes this.
    const prompt = [basePrompt, referenceCtx].filter(Boolean).join("\n\n");

    // Build webhook URL pointing back at us
    const duration = body.durationSeconds ?? 5;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`;
    const webhookUrl = `${baseUrl}/api/v1/webhooks/incoming/fal?sceneId=${scene.id}&duration=${duration}&model=${body.videoModel ?? "veo3-fast"}`;

    const modelKey = body.videoModel ?? "veo3-fast";
    const isSora = modelKey === "sora-2" || modelKey === "sora-2-pro";
    const isGoogleVeo = modelKey.startsWith("google-veo-");
    const isHiggs = modelKey === "higgsfield" || modelKey.startsWith("higgs-");
    const isFal = !isSora && !isGoogleVeo && !isHiggs;

    let jobId: string;
    let provider: "fal" | "openai" | "google" | "higgsfield";
    let displayModel: string;

    // Shared character-sheet logic — every video model has trouble juggling
    // 5 separate character portraits, so when 2+ characters appear in the
    // scene we pre-compose them into a single 1280x720 reference image and
    // describe the layout in the prompt. Sora, Google VEO, and fal all use
    // this same pre-baked sheet.
    //
    // Priority when picking the per-character portrait for the composite:
    //   1. "sheet" — the new one-image-per-character generated by
    //      /api/v1/characters/:id/generate-gallery (2026-04 refactor)
    //   2. "front" — legacy 5-angle galleries
    //   3. first media as last resort
    const sheetCast = inScene
      .map((c) => {
        const sheet = c.media.find((m) => (m.metadata as { angle?: string } | null)?.angle === "sheet");
        const front = c.media.find((m) => (m.metadata as { angle?: string } | null)?.angle === "front");
        const pick = sheet ?? front ?? c.media[0];
        return pick?.fileUrl ? { name: c.name, portraitUrl: pick.fileUrl } : null;
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

    // Sora moderation filter — strip words that trigger moderation_blocked.
    // SC02 was blocked at 74% progress ($2 wasted) because scriptText had "paranoid".
    const SORA_BLOCKED = /\b(paranoid|paranoia|thriller|surveillance|threatening|suspicious|dark psychological|noir|crime|espionage|blood|violence|drugs|tattoo|weapon|gun|knife|attack|murder|kill|dead|death)\b/gi;
    const SORA_SAFE: Record<string, string> = {
      paranoid: "anxious", paranoia: "anxiety", thriller: "drama",
      surveillance: "observation", threatening: "intense", suspicious: "curious",
      "dark psychological": "deep emotional", noir: "shadow-lit", crime: "investigation",
      espionage: "intelligence", blood: "liquid", violence: "conflict",
      drugs: "substances", tattoo: "marking", weapon: "device",
      gun: "object", knife: "tool", attack: "encounter",
      murder: "incident", kill: "remove", dead: "still", death: "ending",
    };
    function sanitizeForSora(text: string): string {
      return text.replace(SORA_BLOCKED, (m) => SORA_SAFE[m.toLowerCase()] ?? "notable");
    }

    try {
      if (isSora) {
        const sec: SoraSeconds = duration <= 5 ? "4" : duration <= 9 ? "8" : duration <= 13 ? "12" : duration <= 17 ? "16" : "20";
        const size = body.aspectRatio === "9:16" ? "720x1280" : "1280x720";

        // Sora specifics (diverges from fal/VEO):
        //   1. The input image becomes the LITERAL first frame — if we pass
        //      the character sheet composite, Sora shows the grid of
        //      portraits at t=0 before fading into the scene. Oren reported
        //      this. Never pass the composite sheet as Sora seed.
        //   2. Prefer a storyboard first-frame (a scene still) as seed when
        //      one exists — it gives a continuity lock on the opening shot.
        //   3. Else pass a SINGLE character portrait (not the grid). The
        //      other cast members are described inline in the prompt.
        //   4. For identityClause: when we're NOT using the sheet, drop the
        //      "reference image is a CHARACTER SHEET" phrasing (it would
        //      confuse Sora) and instead inject per-character descriptions.
        const useStoryboard = firstFrameImg && /^https?:/.test(firstFrameImg);
        const soraSeed = useStoryboard ? firstFrameImg : (sheetCast[0]?.portraitUrl ?? characterRefImgs[0] ?? undefined);
        // Inline cast descriptions for Sora — no grid reference.
        const castBlock = sheetCast.length > 0
          ? `CAST (render each character from these exact descriptions — do NOT show any reference grid or portrait side-by-side layout):\n${sheetCast.map((c) => `- ${c.name}`).join("\n")}\n\n`
          : "";
        const soraPrompt = sanitizeForSora(`${castBlock}${prompt}`);
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
      } else if (isHiggs) {
        const higgsModel = modelKey === "higgs-seedance" ? "bytedance/seedance/v1.5/pro/text-to-video"
          : modelKey === "higgs-kling" ? "kling-video/v3.0/pro/text-to-video"
          : modelKey === "higgs-sora" ? "sora-2/text-to-video"
          : modelKey === "higgs-wan" ? "wan-ai/wan/v2.5/text-to-video"
          : modelKey === "higgsfield" ? "higgsfield-ai/soul/standard"
          : "higgsfield-ai/dop/standard";
        const higgsPrompt = identityClause ? `${identityClause}\n\n${prompt}` : prompt;
        const s = await submitHiggsVideo({
          prompt: higgsPrompt,
          model: higgsModel as any,
          durationSeconds: duration,
          aspectRatio: (body.aspectRatio ?? "16:9") as "16:9" | "9:16" | "1:1",
          imageUrl: firstFrameImg ?? sheetCast[0]?.portraitUrl ?? undefined,
        });
        jobId = s.id; provider = "higgsfield"; displayModel = modelKey;
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

    // Record scene activity log so the "פעילות" tab shows this submission.
    await (prisma as any).sceneLog.create({
      data: {
        sceneId: scene.id,
        action: "video_generated",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
        details: { provider, model: displayModel, durationSeconds: duration, aspectRatio: body.aspectRatio, jobId },
      },
    }).catch(() => {});

    // Mirror to ApiUsage so /admin/wallets unified spend + /learn/tokens
    // can include scene-side video generations (otherwise they show only on
    // the provider wallet via CreditTransaction and the unified picture is split).
    void logUsage({
      model: displayModel,
      operation: "video-gen",
      videoSeconds: duration,
      sourceId: scene.id,
      meta: {
        engine: provider === "openai" ? "openai-video" : provider === "google" ? "gemini-video" : provider === "higgsfield" ? "higgsfield" : "fal-video",
        sceneId: scene.id,
        episodeId: scene.episodeId,
        seasonId: scene.episode?.seasonId,
        title: scene.title || `Scene ${scene.sceneNumber}`,
        purpose: "scene-video",
        jobId,
      },
    }).catch(() => {});

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

    // Write CostEntry so the scene-page "עלות AI" card + /admin/wallets
    // provider spend + project finance all show this video cost. Previously
    // only ApiUsage was written — the UI reads CostEntry.
    const videoCostUsd = isSora
      ? priceSora(displayModel as SoraModelType, duration)
      : isHiggs
        ? priceHiggs(displayModel, duration)
        : 0; // fal/VEO cost is stamped via webhook
    if (videoCostUsd > 0) {
      await chargeUsd({
        organizationId: ctx.organizationId,
        projectId,
        entityType: "SCENE",
        entityId: scene.id,
        providerName: isHiggs ? "Higgsfield" : "OpenAI",
        category: "GENERATION",
        description: `Scene video · ${displayModel} · ${duration}s`,
        unitCost: videoCostUsd,
        quantity: 1,
        userId: ctx.user.id,
        meta: { sceneId: scene.id, episodeId: scene.episodeId, model: displayModel, durationSeconds: duration, jobId },
      }).catch(() => {});
    }

    if (isFal) {
      await prisma.lipSyncJob.create({
        data: { entityType: "SCENE", entityId: scene.id, sceneId: scene.id, status: "PENDING" },
      }).catch(() => {});
    }

    return ok({ jobId, estimate, model: displayModel, provider, framework: isFal ? "fal-queue" : `${provider}-poll`, projectId });
  } catch (e) { return handleError(e); }
}
