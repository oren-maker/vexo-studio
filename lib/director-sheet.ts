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

const SYSTEM = `You are a senior AI video prompt engineer building a production-ready Director Sheet for ONE scene in a TV series.

Return JSON with EXACTLY these keys, each a string (not nested):
{
  "style":     "visual signature — palette, lens, depth of field, film grade, mood (1-3 sentences)",
  "scene":     "location + lighting + atmosphere + foreground/midground/background layers (1-3 sentences)",
  "character": "who appears, movie-level facial detail, expressions, stable identity, breathing/posture cues (1-3 sentences)",
  "shots":     "timecoded beats: [00:00-00:0X] Establishing: … / [00:0X-00:0Y] Build: … / [00:0Y-00:0Z] Payoff: … (use real scene content)",
  "camera":    "primary movement + secondary technique + operator feel (1-2 sentences)",
  "effects":   "VFX, physics, particles, any slow-mo moments (1-2 sentences or 'none' if nothing)",
  "audio":     "SFX foreground, mid-layer ambience, music arc, dialogue strategy (2-3 sentences)",
  "technical": "aspect ratio, total seconds (3-10), fps, identity-consistency rules (1-2 sentences)"
}

Match the tone/genre of the series. Keep each section TIGHT (under 400 chars). No markdown. No brackets.`;

export async function buildDirectorSheet(sceneId: string): Promise<DirectorSheet> {
  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    include: {
      episode: { include: { season: { include: { series: { include: { project: true } } } }, characters: { include: { character: true } } } },
    },
  });

  const projectId = scene.episode?.season.series.projectId;
  const bible = projectId ? (await getContext(projectId))?.summary ?? "" : "";
  const project = scene.episode?.season.series.project;
  const episodeChars = scene.episode?.characters.map((ec) => ec.character.name).join(", ") ?? "";

  const user = [
    project && `SERIES: ${project.name} · language ${project.language}${project.genreTag ? ` · genre ${project.genreTag}` : ""}`,
    bible && `BIBLE:\n${bible}`,
    `EPISODE: #${scene.episode?.episodeNumber} ${scene.episode?.title ?? ""}`,
    `SCENE ${scene.sceneNumber}: ${scene.title ?? ""}`,
    scene.summary && `SUMMARY: ${scene.summary}`,
    scene.scriptText && `SCRIPT:\n${scene.scriptText}`,
    episodeChars && `RECURRING CAST AVAILABLE: ${episodeChars}`,
  ].filter(Boolean).join("\n\n");

  const sheet = await groqJson<Omit<DirectorSheet, "generatedAt">>(
    SYSTEM,
    user,
    { temperature: 0.4, maxTokens: 1400 },
  );

  const withTs: DirectorSheet = { ...sheet, generatedAt: new Date().toISOString() };
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
