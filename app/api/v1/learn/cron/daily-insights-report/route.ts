import { NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { computeCorpusInsights } from "@/lib/learn/corpus-insights";
import { logUsage } from "@/lib/learn/usage-tracker";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const API_KEY = process.env.GEMINI_API_KEY;

async function writeDailySummary(insights: any, yesterdayCounts: { sources: number; nodes: number } | null): Promise<string> {
  if (!API_KEY) return "";
  const delta = yesterdayCounts ? {
    sourcesAdded: insights.totals.sources - yesterdayCounts.sources,
    nodesAdded: insights.totals.knowledgeNodes - yesterdayCounts.nodes,
  } : null;

  const prompt = `אתה מערכת תובנות. כתוב סיכום יומי בעברית (3-4 משפטים) של מה שהשתנה בקורפוס היום.

נתונים:
- סה"כ פרומפטים: ${insights.totals.sources}
- סה"כ Knowledge Nodes: ${insights.totals.knowledgeNodes}
- ממוצע מילים/פרומפט: ${insights.totals.avgWordsPerPrompt}
- ממוצע טכניקות/פרומפט: ${insights.totals.avgTechniquesPerPrompt}
- Top 5 טכניקות: ${insights.topTechniques.slice(0,5).map((t: any) => t.name).join(", ")}
${delta ? `- מאתמול: +${delta.sourcesAdded} פרומפטים, +${delta.nodesAdded} nodes` : ""}

החזר טקסט עברית בלבד, לא JSON, לא markdown.`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 400 },
      }),
    });
    const data: any = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    await logUsage({
      model: "gemini-3-flash",
      operation: "insights-snapshot" as any,
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      meta: { purpose: "daily-insights-report" },
    });
    return text;
  } catch {
    return "";
  }
}

export async function GET() {
  try {
    const insights = await computeCorpusInsights();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const prev = await prisma.insightsSnapshot.findFirst({
      where: { takenAt: { lte: yesterday } },
      orderBy: { takenAt: "desc" },
    });
    const yesterdayCounts = prev ? { sources: prev.sourcesCount, nodes: prev.nodesCount } : null;

    const summary = await writeDailySummary(insights, yesterdayCounts);

    const snap = await prisma.insightsSnapshot.create({
      data: {
        sourcesCount: insights.totals.sources,
        analysesCount: insights.totals.analyses,
        nodesCount: insights.totals.knowledgeNodes,
        avgTechniques: insights.totals.avgTechniquesPerPrompt,
        avgWords: insights.totals.avgWordsPerPrompt,
        timecodePct: Math.round((insights.totals.promptsWithTimecodes / Math.max(insights.totals.sources, 1)) * 100),
        data: insights as any,
        summary,
        kind: "daily-report",
      },
    });
    return NextResponse.json({ ok: true, snapshotId: snap.id, summary });
  } catch (e: any) {
    console.error("[daily-insights-report]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
