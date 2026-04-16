/**
 * Break a single master opening prompt into N 20-second chunk prompts that
 * flow into each other (first clip + extensions). Uses Gemini 3 Flash with
 * a locked JSON schema — returns ["chunk 1 prompt", "chunk 2 prompt", ...].
 *
 * Called once at generate time for durations > 20s. The chunk prompts are
 * stored on SeasonOpening.chunkPrompts and consumed sequentially by the
 * poll loop as each chunk finishes.
 */

const GEMINI_MODELS = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-2.5-flash"];

export async function splitPromptIntoChunks(opts: {
  masterPrompt: string;
  totalSeconds: number;   // 40, 60, 80, 100, 120
  seriesTitle: string;
}): Promise<string[]> {
  const chunkCount = Math.ceil(opts.totalSeconds / 20);
  if (chunkCount < 2) return [opts.masterPrompt];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Fallback: repeat the master prompt per chunk. Better than failing.
    return Array(chunkCount).fill(opts.masterPrompt);
  }

  const system = `You split a cinematic video-generation prompt into N sequential 20-second chunks that Sora 2 will render and chain via extensions. Output a JSON object: { "chunks": ["chunk 1 prompt", "chunk 2 prompt", ...] } with EXACTLY ${chunkCount} entries.

HARD RULES for each chunk prompt:
1. Every chunk must stand on its own as a coherent Sora prompt with all 8 sections (Visual Style / Lens / Lighting / Color / Character / Environment / Audio / Timeline) so Sora doesn't drift.
2. Each chunk is EXACTLY 20 seconds — timeline in the prompt must be 0-5s / 5-12s / 12-18s / 18-20s beats.
3. Chunk N+1 must begin EXACTLY where chunk N ended. Describe the carry-over in chunk N+1's Timeline section: "0-5s: continues from prior clip — subject still mid-gesture, same wardrobe, same lighting, same location".
4. Chunk 1 is the establishing opener. Middle chunks develop motion + reveals. The LAST chunk MUST close with a 1.5-second fade-to-black at 18.5-20s, because that's the episode boundary per series rule.
5. Keep continuity cues explicit: same cast, same wardrobe, same color palette, same camera ethos across all chunks.
6. Use only positive descriptive language (no "avoid", "no", "don't"). Photorealistic live-action only.
7. Each chunk prompt ≤ 1800 chars.

Output strict JSON only, no markdown fences.`;

  const user = `SERIES: ${opts.seriesTitle}
TOTAL DURATION: ${opts.totalSeconds} seconds
CHUNK COUNT: ${chunkCount} × 20s

MASTER PROMPT (split this into ${chunkCount} sequential 20s chunks):
${opts.masterPrompt}

Return JSON with ${chunkCount} chunk prompts. The last chunk MUST end with fade-to-black.`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: {
              temperature: 0.75,
              maxOutputTokens: 16384,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(40_000),
        },
      );
      if (!res.ok) continue;
      const json: any = await res.json();
      const raw: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      let txt = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const first = txt.indexOf("{"); const last = txt.lastIndexOf("}");
      if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
      const parsed = JSON.parse(txt) as { chunks?: string[] };
      if (Array.isArray(parsed.chunks) && parsed.chunks.length === chunkCount) {
        return parsed.chunks.map((c) => String(c).slice(0, 1800));
      }
    } catch {/* try next model */}
  }
  // All models failed — fall back to repeating master prompt
  return Array(chunkCount).fill(opts.masterPrompt);
}
