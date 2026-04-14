/**
 * Director Sheet — structured 8-section production prompt per scene.
 * Pattern taken from vexo-learn's prompt generator:
 *   [Style] [Scene] [Character] [Shots] [Camera] [Effects] [Audio] [Technical]
 *
 * Every scene in the system should have one — it's the input we hand to the
 * video model when we actually shoot.
 */
import { prisma } from "./prisma";
import { groqChat, groqJson } from "./groq";
import { getContext } from "./project-context";

export interface DirectorSheet {
  style: string;        // visual signature, palette, lens/depth, film look
  scene: string;        // location, lighting, atmosphere, layers
  character: string;    // who's in it, physical detail, expressions, continuity
  shots: string;        // time-coded beats ([00:00-00:05] Establishing: … )
  camera: string;       // primary movement + secondary technique
  effects: string;      // VFX, physics, particles, slow-mo moments
  audio: string;        // SFX / ambience / music strategy + dialogue cues
  technical: string;    // aspect, duration, fps, identity consistency
  generatedAt: string;
}

const SYSTEM = `You are a senior AI video prompt engineer writing a Director Sheet for ONE specific scene in a TV series.

**CRITICAL RULE: Every section MUST be grounded in the actual script text that follows. Do NOT write generic cinematography advice. Read the dialogue, the actions, the character beats — then describe EXACTLY what happens and how to shoot it professionally.**

You will receive: series bible · episode+scene details · script (dialogue + action lines) · characters in scene (with appearance) · storyboard frames (ordered beats) · optional director notes · optional sound notes · latest critic feedback.

Return JSON with EXACTLY these 8 keys, each a string (not nested):
{
  "style":     "Visual signature grounded in the scene's emotional tone — palette, lens, depth, film grade, mood. Reference the script's mood, not generic. (1-3 sentences)",
  "scene":     "Location + lighting + atmosphere + foreground/midground/background layers — exactly what the script describes. If the script says 'dim bedroom at night', the sheet reflects THAT. (1-3 sentences)",
  "character": "Name every character speaking/acting in the script. Repeat their appearance (hair, eyes, wardrobe, build) so identity locks to reference images. Describe their STATE in this scene per the script (anxious, suspicious, etc). 2-4 sentences.",
  "shots":     "Map each storyboard frame to a timecoded beat from the script's action. Format: [00:00-00:0X] — <what's on screen at this beat, from the frame + script>. [00:0X-00:0Y] — <next beat>. Use frames verbatim when present.",
  "camera":    "Camera movement + lens + framing choices that SERVE this scene's emotion. E.g. 'handheld close-up that tightens during Mira's line' — link to the script's actions. (1-2 sentences)",
  "effects":   "VFX/physics/particles/slow-mo only if the script suggests it (e.g. memory flash, impact). Otherwise 'none'. (1-2 sentences)",
  "audio":     "SFX foreground + mid ambience + music arc + dialogue: name characters speaking lines from the script. Respect any sound notes the user added. (2-3 sentences)",
  "technical": "Aspect ratio, total seconds (tied to frame count × ~3s, max 12), 24fps, and: 'Lock identity to the reference images for every character across all shots — no face drift.'"
}

Honor: director notes > sound notes > critic feedback, in that priority. Keep each section TIGHT (under 500 chars). No markdown. No nested objects. No placeholder text.`;

export async function buildDirectorSheet(sceneId: string): Promise<DirectorSheet> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      frames: { orderBy: { orderIndex: "asc" } },
      episode: {
        include: {
          season: { include: { series: { include: { project: true } } } },
          characters: {
            include: {
              character: { include: { media: { orderBy: { createdAt: "asc" } } } },
            },
          },
        },
      },
    },
  });
  if (!scene) throw new Error("scene not found");

  const projectId = scene.episode?.season.series.projectId;
  const bible = projectId ? (await getContext(projectId).catch(() => null))?.summary ?? "" : "";
  const project = scene.episode?.season.series.project;

  // Resolve which characters appear in THIS scene (via memoryContext.characters),
  // fall back to the whole episode's cast.
  const sceneMem = (scene.memoryContext as { characters?: string[] } | null) ?? {};
  const sceneNames = (sceneMem.characters ?? []).map((n) => n.toLowerCase().trim());
  const episodeChars = scene.episode?.characters.map((ec) => ec.character) ?? [];
  const inScene = sceneNames.length > 0
    ? episodeChars.filter((c) => sceneNames.includes(c.name.toLowerCase().trim()))
    : episodeChars;

  // URLs are useless to a text model — just waste tokens. Keep the description only.
  // Aggressive trimming — Gemini hangs on >3KB inputs in our workload.
  const charactersBlock = inScene.length === 0
    ? "(none)"
    : inScene.slice(0, 4).map((c) => `• ${c.name} — ${(c.appearance ?? "").slice(0, 90)}`).join("\n");

  const framesBlock = scene.frames.length === 0
    ? "(none)"
    : scene.frames.slice(0, 4).map((f, i) => `${i + 1}. ${(f.beatSummary ?? "").slice(0, 80)}`).join("\n");

  // Pull in the director's manual notes + latest critic scores (last 2) so
  // the sheet integrates everything the user has told us.
  const mc = (scene.memoryContext as { directorNotes?: string; soundNotes?: string } | null) ?? {};
  const critics = await prisma.aICriticReview.findMany({
    where: { sceneId },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { contentType: true, score: true, feedback: true },
  }).catch(() => []);

  const user = [
    project && `SERIES: ${project.name} · ${project.language}${project.genreTag ? ` · ${project.genreTag}` : ""}`,
    bible && `BIBLE:\n${bible.slice(0, 500)}`,
    `EP${scene.episode?.episodeNumber ?? "?"} · SC${scene.sceneNumber} ${scene.title ?? ""}`,
    scene.summary && `SUMMARY: ${scene.summary.slice(0, 300)}`,
    scene.scriptText && `SCRIPT:\n${scene.scriptText.slice(0, 700)}`,
    `CAST:\n${charactersBlock}`,
    `FRAMES:\n${framesBlock}`,
    mc.directorNotes && `DIRECTOR NOTES: ${mc.directorNotes.slice(0, 250)}`,
    mc.soundNotes && `SOUND NOTES: ${mc.soundNotes.slice(0, 200)}`,
    critics[0] && `LATEST CRITIC: ${(critics[0].feedback ?? "").slice(0, 150)}`,
  ].filter(Boolean).join("\n\n");

  // Single AI call only. Two-pass was hitting 60s vercel timeout because each
  // groqChat retries through Gemini → Groq fallback (2 × 12s) and we did 2 calls.
  let sheet: Omit<DirectorSheet, "generatedAt"> = {
    style: "", scene: "", character: "", shots: "", camera: "", effects: "", audio: "", technical: "",
  };

  try {
    const json = await groqJson<Partial<Omit<DirectorSheet, "generatedAt">>>(
      SYSTEM, user,
      { temperature: 0.4, maxTokens: 2500, projectId: projectId ?? undefined, description: `Director sheet · scene ${scene.sceneNumber}` },
    );
    sheet = {
      style:     String(json.style ?? "").trim(),
      scene:     String(json.scene ?? "").trim(),
      character: String(json.character ?? "").trim(),
      shots:     String(json.shots ?? "").trim(),
      camera:    String(json.camera ?? "").trim(),
      effects:   String(json.effects ?? "").trim(),
      audio:     String(json.audio ?? "").trim(),
      technical: String(json.technical ?? "").trim(),
    };
  } catch (e) {
    throw new Error(`AI failed: ${(e as Error).message.slice(0, 200)}`);
  }

  // Fill empty sections with placeholders so the user sees what's missing
  const labels: Record<keyof typeof sheet, string> = {
    style: "Cinematic, photorealistic, warm tones (auto)",
    scene: "(generate again to fill)",
    character: "(generate again to fill — name your scene characters explicitly in the script)",
    shots: "(generate again to fill)",
    camera: "Handheld medium shots with subtle push-in (auto)",
    effects: "none",
    audio: "Natural ambient room tone, breathing, dialogue clearly audible (auto)",
    technical: "16:9 · 5-8s · 24fps · identity locked to reference images (auto)",
  };
  for (const k of Object.keys(sheet) as (keyof typeof sheet)[]) {
    if (!sheet[k]) sheet[k] = labels[k];
  }

  // Ensure every key exists as a string — Gemini sometimes drops one
  const safe: Omit<DirectorSheet, "generatedAt"> = {
    style:     String(sheet.style ?? "").slice(0, 1000),
    scene:     String(sheet.scene ?? "").slice(0, 1000),
    character: String(sheet.character ?? "").slice(0, 1000),
    shots:     String(sheet.shots ?? "").slice(0, 1500),
    camera:    String(sheet.camera ?? "").slice(0, 1000),
    effects:   String(sheet.effects ?? "").slice(0, 1000),
    audio:     String(sheet.audio ?? "").slice(0, 1000),
    technical: String(sheet.technical ?? "").slice(0, 500),
  };

  const withTs: DirectorSheet = { ...safe, generatedAt: new Date().toISOString() };
  const merged = { ...(scene.memoryContext as object ?? {}), directorSheet: withTs };
  await prisma.scene.update({
    where: { id: sceneId },
    data: { memoryContext: merged as object },
  });
  return withTs;
}

/** Build a single flat prompt from a sheet — what gets passed to VEO/Seedance. */
export function sheetToPrompt(s: DirectorSheet): string {
  return [
    `[Style] ${s.style}`,
    `[Scene] ${s.scene}`,
    `[Character] ${s.character}`,
    `[Camera] ${s.camera}`,
    `[Shots] ${s.shots}`,
    `[Effects] ${s.effects}`,
    `[Audio] ${s.audio}`,
    `[Technical] ${s.technical}`,
  ].join("\n\n");
}
