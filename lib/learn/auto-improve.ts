// After every new InsightsSnapshot, run one pass of auto-improvement on a
// handful of prompts that look "stale" vs the current corpus norms.
// Uses Gemini Flash. Every improvement snapshots the previous version
// into PromptVersion so nothing is lost.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "./db";
import { logUsage } from "./usage-tracker";
import { snapshotCurrentVersion, computeTextDiff } from "./prompt-versioning";
import { computeCorpusInsights } from "./corpus-insights";
import { updateJob } from "./sync-jobs";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-flash-latest";

const SYSTEM = `You upgrade existing Seedance 2.0 / Sora video prompts so they meet the FULL cinematic prompt standard. English prompts only.

A complete video prompt MUST contain ALL 8 sections (aim 400–900 words total):
1. **Visual Style** — genre + render level (e.g. "Cinematic photoreal 8K", "3D CG IMAX")
2. **Film Stock & Lens** — explicit camera/lens/aperture ("35mm anamorphic, f/2.8")
3. **Color Palette & Grade** — concrete colors ("teal-orange desaturated, dusty undertones")
4. **Lighting & Atmosphere** — volumetric, direction, particles ("Golden Hour volumetric with dust motes")
5. **Character / Subject** — age, build, wardrobe, hair, expression + consistency note
6. **Audio / Sound Design** — explicit SFX + ambient + any dialogue in quotes
7. **Timeline with timecoded beats** — MANDATORY: 3–5 beats like [0-3s], each with Shot Type + Camera move + Visual content + Sound cue
8. **Quality Boosters** final line — "Photorealistic 8K, ultra-detailed, no artifacts, motion blur, HDR, consistent identity"

You receive the current prompt + derived corpus rules + co-occurrence pairs + style signatures.

Your job — ALWAYS upgrade unless ALL 8 sections are already present AND prompt ≥ 400 words. Only return { "keep": true } when the prompt is truly exemplary across all 8 dimensions.

Otherwise rewrite it:
- Preserve the core subject/scene/intent
- Fill in every missing section with cinematically appropriate choices (invent lens/grade/lighting/sound if the original is vague)
- Inject 2–3 of the derived rules where they fit naturally
- Use clear section headers (bold or ALL-CAPS)

Output ONLY valid JSON:
  { "keep": true }
OR
  { "keep": false, "upgradedPrompt": "<full 400-900 word prompt with all 8 sections>", "reason": "<one short Hebrew sentence — which sections you added/tightened>" }

No markdown fencing, no commentary. Self-check before returning: all 8 sections present? length OK?`;

async function improveWithGemini(userMsg: string): Promise<any> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY חסר");
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM,
    generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 4096 },
  });
  const result = await model.generateContent(userMsg);
  const u = result.response.usageMetadata;
  await logUsage({
    model: MODEL,
    operation: "improve",
    inputTokens: u?.promptTokenCount || 0,
    outputTokens: u?.candidatesTokenCount || 0,
    meta: { purpose: "auto-improve" },
  });
  return JSON.parse(result.response.text());
}

export async function runAutoImprovement(
  snapshotId: string,
  maxCandidates = 5,
  jobId?: string,
): Promise<{
  runId: string;
  examined: number;
  improved: number;
  totalCostUsd: number;
  details: Array<{ sourceId: string; kept: boolean; reason?: string }>;
}> {
  const run = await prisma.improvementRun.create({
    data: { snapshotId, status: "running" },
  });

  const tick = async (step: string, msg?: string, completed?: number, total?: number) => {
    if (jobId) await updateJob(jobId, { currentStep: step, currentMessage: msg, ...(completed != null ? { completedItems: completed } : {}), ...(total != null ? { totalItems: total } : {}) });
  };

  try {
    await tick("טוען תובנות", "חישוב derived rules + co-occurrence");
    const insights = await computeCorpusInsights();

    await tick("בוחר פרומפטים רזים", "דירוג לפי richness score");
    // Rank all prompts by weakness; take the N weakest. Gemini still decides keep:true if it's already good enough.
    const candidates = await prisma.learnSource.findMany({
      where: {
        status: "complete",
        analysis: { isNot: null },
      },
      include: { analysis: true },
    });
    const scored = candidates
      .filter((s) => s.analysis)
      .map((s) => {
        const techniques = s.analysis!.techniques.length;
        const words = s.prompt.split(/\s+/).length;
        const hasTimecodes = /\b\d{1,2}:\d{2}\b/.test(s.prompt) ? 1 : 0;
        // Lower = weaker = better candidate for improvement
        const score = techniques * 3 + Math.min(words / 40, 10) + hasTimecodes * 2;
        return { s, score };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, maxCandidates)
      .map((x) => x.s);
    const stale = scored;

    const rulesBlock = insights.derivedRules.map((r) => `- ${r}`).join("\n");
    const cooccurBlock = insights.cooccurrencePairs
      .slice(0, 6)
      .map((p) => `- ${p.a} + ${p.b} (lift ×${p.lift})`)
      .join("\n");
    const styleBlock = insights.styleProfiles
      .slice(0, 4)
      .map((p) => `- ${p.style}: ${p.signaturePhrases.slice(0, 3).join(", ") || p.topTechniques.slice(0, 3).map((t) => t.name).join(", ")}`)
      .join("\n");

    const details: Array<{ sourceId: string; kept: boolean; reason?: string }> = [];
    let improved = 0;
    let totalCost = 0;
    const startCost = (await prisma.apiUsage.aggregate({ _sum: { usdCost: true } }))._sum.usdCost || 0;

    await tick("Gemini בודק ומשפר", `נמצאו ${stale.length} מועמדים`, 0, stale.length);

    let idx = 0;
    for (const source of stale) {
      idx++;
      const title = (source.title || source.prompt.slice(0, 40)).slice(0, 60);
      await tick("Gemini בודק ומשפר", `${idx}/${stale.length}: "${title}"`, idx - 1, stale.length);
      const userMsg = `=== CURRENT PROMPT ===\n${source.prompt}\n\n=== DERIVED RULES ===\n${rulesBlock}\n\n=== CO-OCCURRENCE PAIRS ===\n${cooccurBlock}\n\n=== STYLE SIGNATURES ===\n${styleBlock}\n\nReturn JSON now.`;

      let parsed: any;
      try {
        parsed = await improveWithGemini(userMsg);
      } catch (e: any) {
        details.push({ sourceId: source.id, kept: true, reason: `error: ${String(e.message || e).slice(0, 100)}` });
        continue;
      }

      if (parsed.keep) {
        await tick("Gemini בודק ומשפר", `${idx}/${stale.length}: נשמר ללא שינוי — "${title}"`, idx, stale.length);
        details.push({ sourceId: source.id, kept: true });
        continue;
      }

      const upgradedPrompt = String(parsed.upgradedPrompt || "").trim();
      const reason = String(parsed.reason || "שדרוג אוטומטי").trim();
      const upgradedWords = upgradedPrompt.split(/\s+/).length;
      if (upgradedWords < 300) {
        details.push({ sourceId: source.id, kept: true, reason: `upgrade too short (${upgradedWords} words)` });
        continue;
      }
      // Must actually be longer than the original — otherwise the "upgrade" is a regression
      if (upgradedPrompt.length <= source.prompt.length) {
        details.push({ sourceId: source.id, kept: true, reason: "upgrade not longer than original" });
        continue;
      }

      await tick("שומר גרסה קודמת", `${idx}/${stale.length}: snapshot של "${title}"`, idx - 1, stale.length);
      // Snapshot current before changing
      await snapshotCurrentVersion(source.id, "auto-improve", reason, snapshotId);
      const diff = computeTextDiff(source.prompt, upgradedPrompt);

      await prisma.learnSource.update({
        where: { id: source.id },
        data: { prompt: upgradedPrompt },
      });

      // Store diff in the just-created PromptVersion
      const latestVersion = await prisma.promptVersion.findFirst({
        where: { sourceId: source.id },
        orderBy: { version: "desc" },
      });
      if (latestVersion) {
        await prisma.promptVersion.update({
          where: { id: latestVersion.id },
          data: { diff: diff as any },
        });
      }

      improved++;
      await tick("מחיל שדרוג", `${idx}/${stale.length}: ✅ שודרג — ${reason.slice(0, 80)}`, idx, stale.length);
      details.push({ sourceId: source.id, kept: false, reason });
    }

    const endCost = (await prisma.apiUsage.aggregate({ _sum: { usdCost: true } }))._sum.usdCost || 0;
    totalCost = Math.max(0, endCost - startCost);

    await prisma.improvementRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        sourcesExamined: stale.length,
        sourcesImproved: improved,
        totalCostUsd: totalCost,
        status: "complete",
        summary: `נבדקו ${stale.length} פרומפטים · שודרגו ${improved}`,
      },
    });

    return { runId: run.id, examined: stale.length, improved, totalCostUsd: totalCost, details };
  } catch (e: any) {
    await prisma.improvementRun.update({
      where: { id: run.id },
      data: { status: "failed", summary: String(e.message || e).slice(0, 300), completedAt: new Date() },
    });
    throw e;
  }
}
