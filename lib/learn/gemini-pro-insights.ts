// Gemini 2.5 Pro for strategic, high-value reasoning over aggregated corpus insights.
// Used to generate human-quality strategic recommendations beyond what simple counting can produce.

import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-pro";

const SYSTEM = `You are a senior AI video prompt strategist. You receive aggregated statistics about a corpus of AI video prompts (top techniques, styles, gaps, upgrade patterns) and produce 3-7 SHARP strategic insights in Hebrew that the user can ACT on.

Each insight must be:
- 1-2 sentences max
- ACTIONABLE (tell the user what to do, not just what is)
- Grounded in the data — cite specific numbers when relevant
- Distinct from the others (no overlapping advice)
- Prioritized: insight #1 should be the most impactful

Output ONLY valid JSON:
{
  "strategicInsights": [
    "<sentence in Hebrew, with concrete number/name from the data>",
    ...
  ]
}

No markdown. No commentary outside the JSON.`;

export async function generateStrategicInsights(corpusSummary: any): Promise<string[]> {
  if (!API_KEY) return [];
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const summary = JSON.stringify(
      {
        totals: corpusSummary.totals,
        topTechniques: corpusSummary.topTechniques?.slice(0, 10),
        topStyles: corpusSummary.topStyles?.slice(0, 8),
        topMoods: corpusSummary.topMoods?.slice(0, 6),
        gaps: corpusSummary.gaps?.slice(0, 6),
        cooccurrencePairs: corpusSummary.cooccurrencePairs?.slice(0, 6),
        derivedRules: corpusSummary.derivedRules,
        upgrades: corpusSummary.upgrades && {
          totalUpgrades: corpusSummary.upgrades.totalUpgrades,
          avgWordDelta: corpusSummary.upgrades.avgWordDelta,
          avgWordPctDelta: corpusSummary.upgrades.avgWordPctDelta,
          sectionGrowth: corpusSummary.upgrades.sectionGrowth?.slice(0, 5),
          topAddedPhrases: corpusSummary.upgrades.topAddedPhrases?.slice(0, 8),
        },
      },
      null,
      2,
    );
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Corpus summary:\n\`\`\`\n${summary}\n\`\`\`\n\nReturn the JSON now.` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 2048 },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.warn("[pro-insights]", res.status, (await res.text()).slice(0, 200));
      return [];
    }
    const json: any = await res.json();
    await logUsage({
      model: MODEL,
      operation: "knowledge-extract",
      inputTokens: json.usageMetadata?.promptTokenCount || 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount || 0,
      meta: { purpose: "strategic-insights" },
    });
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed.strategicInsights) ? parsed.strategicInsights.map(String).slice(0, 7) : [];
  } catch (e) {
    console.warn("[pro-insights] failed:", String(e).slice(0, 200));
    return [];
  }
}
