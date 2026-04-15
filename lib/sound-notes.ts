/**
 * Shared sound-notes generator. Called from:
 *  - /api/v1/scenes/[id]/sound-notes (manual button)
 *  - /api/v1/seasons/[id]/generate-episode (auto on scene create)
 *  - /api/v1/scenes/[id]/generate-video (auto if missing before video)
 */
import { groqChat } from "@/lib/groq";

const SYSTEM = `You are a senior production sound designer + dialogue editor for a TV series. Read the FULL script line by line and write detailed SOUND NOTES in Hebrew (300-450 words) — this goes straight to a video model that needs to hear EVERY layer.

Output the notes as 6 LABELED sections in Hebrew, each with concrete specifics drawn from the script (no generic placeholders, no 'tense music'):

🎵 מוזיקה: genre, instruments (specific: piano + cello + sub-bass synth), BPM range, when it enters/builds/recedes, what emotion it carries — tied to script beats by timecode.

🔊 אפקטים מקדמת התמונה (Foley/SFX): list EVERY action from the script as its own SFX cue — footsteps on what surface, door (open/close how hard), keyboards, phone (ring tone? haptic?), paper rustle, breath, glass, etc. One bullet per cue with timestamp if clear.

🌫 אמביינס/רעש סביבה: 3-6 specific environmental sounds layered under (e.g. distant traffic through window, fluorescent buzz at 60Hz, server room hum, rain on glass). Be precise about volume and panning.

🎙 דיאלוג ולחץ שפתיים (Lip-sync): for EACH line of dialogue in the script, write: speaker name → exact line → emotion (tense / whispered / loud / breathy) → lip-sync direction (tight close-sync; off-screen V.O.; phone-filtered; whispered). Include any breath/pause beats between lines.

🎚 מעברי סאונד וצמצומים (Mix moves): how dialogue ducks music, when ambience drops out for impact, any swell/cut/silence beats. Pin to script moments.

⚡ רגעים מיוחדים: specific punch-in moments (ringing phone breaking silence, memory flash sting, heart-thump sub-drop, etc.) with exact timing.

Stay grounded in THIS script's exact words and characters — name them. No generic 'newsroom ambience' — describe WHICH newsroom sounds (which keyboards, which TVs, which voices). Output Hebrew, no English headers other than the emojis.`;

export interface SoundNotesContext {
  projectName?: string;
  language?: string;
  genre?: string;
  episodeNumber?: number;
  sceneNumber: number;
  sceneTitle?: string | null;
  summary?: string | null;
  scriptText?: string | null;
  directorSheetAudio?: string | null;
  directorNotes?: string | null;
}

export async function generateSoundNotes(c: SoundNotesContext, projectId?: string): Promise<string> {
  const user = [
    c.projectName && `Series: ${c.projectName} (${c.language ?? "?"}${c.genre ? ", " + c.genre : ""})`,
    `EP${c.episodeNumber ?? "?"} · SC${c.sceneNumber} ${c.sceneTitle ?? ""}`,
    c.summary && `Summary: ${c.summary.slice(0, 300)}`,
    c.scriptText && `Script:\n${c.scriptText.slice(0, 1000)}`,
    c.directorSheetAudio && `Director sheet [Audio] section: ${c.directorSheetAudio.slice(0, 300)}`,
    c.directorNotes && `Director notes: ${c.directorNotes.slice(0, 200)}`,
  ].filter(Boolean).join("\n\n");

  // 800 tokens fits the 300-450 word target with headroom; 1500 was too generous
  // and pushed groq's response time over Vercel's 60s function limit on cold starts.
  const text = await groqChat(
    [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
    { temperature: 0.5, maxTokens: 800, projectId, description: `Sound notes · scene ${c.sceneNumber}` },
  );
  return text.trim();
}
