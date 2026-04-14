/**
 * Director Sheet — structured 8-section production prompt per scene.
 * Pattern taken from vexo-learn's prompt generator:
 *   [Style] [Scene] [Character] [Shots] [Camera] [Effects] [Audio] [Technical]
 *
 * Every scene in the system should have one — it's the input we hand to the
 * video model when we actually shoot.
 */
import { prisma } from "./prisma";
import { groqJson } from "./groq";
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

const SYSTEM = `You are a senior AI video prompt engineer building a production-ready Director Sheet for ONE scene in a TV series. You will be given: series bible, episode+scene details, the EXACT characters appearing (with appearance + reference image URLs), and the storyboard frame beats (with frame image URLs). Your output is fed directly into VEO 3 / SeeDance / Kling.

Return JSON with EXACTLY these keys, each a string (not nested):
{
  "style":     "visual signature — palette, lens, depth of field, film grade, mood (1-3 sentences). Must fit the series genre.",
  "scene":     "location + lighting + atmosphere + foreground/midground/background layers, all specific to THIS scene (1-3 sentences)",
  "character": "NAME every character from the input; repeat their exact appearance (hair, eyes, wardrobe, build, distinctive features) so the model locks their identity to the reference images. 2-4 sentences. Never invent a new character, never describe in generic terms if a ref_image_url was provided.",
  "shots":     "timecoded beats that MAP to the storyboard frames in order. Format: [00:00-00:0X] <frame #1 beat>. [00:0X-00:0Y] <frame #2 beat>. If frames exist, use them verbatim as the shot list.",
  "camera":    "primary movement + secondary technique + operator feel (1-2 sentences)",
  "effects":   "VFX, physics, particles, any slow-mo moments (1-2 sentences or 'none' if nothing)",
  "audio":     "SFX foreground, mid-layer ambience, music arc, dialogue strategy with character names speaking (2-3 sentences)",
  "technical": "aspect ratio, total seconds (match the number of frames × ~3s each, max 12), fps (24), identity-consistency rule: 'match the reference images for every character across all shots — no face drift'."
}

Match the tone/genre of the series. Keep each section TIGHT (under 500 chars). No markdown. No brackets in values.`;

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

  const charactersBlock = inScene.length === 0
    ? "(no recurring cast in this scene)"
    : inScene.map((c) => {
        const front = c.media.find((m) => (m.metadata as { angle?: string } | null)?.angle === "front") ?? c.media[0];
        return [
          `• ${c.name}${c.roleType ? ` (${c.roleType})` : ""}`,
          c.appearance && `   appearance: ${c.appearance.slice(0, 300)}`,
          c.wardrobeRules && `   wardrobe: ${c.wardrobeRules.slice(0, 200)}`,
          c.personality && `   personality: ${c.personality.slice(0, 200)}`,
          front?.fileUrl && `   ref_image_url: ${front.fileUrl}`,
        ].filter(Boolean).join("\n");
      }).join("\n\n");

  const framesBlock = scene.frames.length === 0
    ? "(no storyboard frames yet)"
    : scene.frames.map((f, i) => {
        const img = f.approvedImageUrl || f.generatedImageUrl;
        return [
          `#${i + 1}: ${f.beatSummary ?? "—"}`,
          f.imagePrompt && `   prompt: ${f.imagePrompt.slice(0, 200)}`,
          img && `   frame_image_url: ${img}`,
        ].filter(Boolean).join("\n");
      }).join("\n");

  const user = [
    project && `SERIES: ${project.name} · language ${project.language}${project.genreTag ? ` · genre ${project.genreTag}` : ""}`,
    bible && `BIBLE:\n${bible.slice(0, 1500)}`,
    `EPISODE: #${scene.episode?.episodeNumber ?? "?"} ${scene.episode?.title ?? ""}`,
    `SCENE ${scene.sceneNumber}: ${scene.title ?? ""}`,
    scene.summary && `SUMMARY: ${scene.summary}`,
    scene.scriptText && `SCRIPT:\n${scene.scriptText.slice(0, 1200)}`,
    `CHARACTERS IN THIS SCENE (use their exact appearance in [Character] section; lock identity to their ref_image_urls — DO NOT invent new faces):\n${charactersBlock}`,
    `STORYBOARD FRAMES (build the [Shots] timeline around these exact beats, reference them in order):\n${framesBlock}`,
  ].filter(Boolean).join("\n\n");

  let sheet: Omit<DirectorSheet, "generatedAt">;
  try {
    sheet = await groqJson<Omit<DirectorSheet, "generatedAt">>(
      SYSTEM,
      user,
      { temperature: 0.4, maxTokens: 1200, projectId: projectId ?? undefined, description: `Director sheet · scene ${scene.sceneNumber}` },
    );
  } catch (e) {
    throw new Error(`AI failed: ${(e as Error).message.slice(0, 200)}`);
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
