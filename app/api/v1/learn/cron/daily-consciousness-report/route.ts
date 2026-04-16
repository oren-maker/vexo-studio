import { NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { logUsage } from "@/lib/learn/usage-tracker";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const API_KEY = process.env.GEMINI_API_KEY;

export async function GET() {
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const snapshots = await prisma.insightsSnapshot.findMany({
      where: { takenAt: { gte: since }, kind: "hourly" },
      orderBy: { takenAt: "asc" },
    });

    if (snapshots.length === 0) {
      return NextResponse.json({ ok: true, message: "no snapshots in last 24h" });
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const deltas = {
      sources: last.sourcesCount - first.sourcesCount,
      nodes: last.nodesCount - first.nodesCount,
      avgWords: last.avgWords - first.avgWords,
      avgTechniques: Number((last.avgTechniques - first.avgTechniques).toFixed(2)),
    };

    let summary = `ב-24 שעות: +${deltas.sources} פרומפטים, +${deltas.nodes} nodes. ממוצע מילים: ${deltas.avgWords > 0 ? "+" : ""}${deltas.avgWords}, טכניקות: ${deltas.avgTechniques > 0 ? "+" : ""}${deltas.avgTechniques}.`;

    if (API_KEY) {
      const prompt = `אתה מערכת תודעה. נתון יומן של ${snapshots.length} snapshots שעתיים של מצב המערכת.

התחלה: ${first.sourcesCount} פרומפטים · ${first.nodesCount} nodes
סוף: ${last.sourcesCount} פרומפטים · ${last.nodesCount} nodes
שינוי: +${deltas.sources} פרומפטים · +${deltas.nodes} nodes · ${deltas.avgWords > 0 ? "+" : ""}${deltas.avgWords} מילים ממוצע

כתוב "מפת תודעה יומית" קצרה בעברית (3-5 משפטים): על מה שווה לשים לב, איזה מדדים עלו/ירדו, מה זה אומר על המערכת היום.`;

      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 500 },
          }),
        });
        const data: any = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) summary = text;
        await logUsage({
          model: "gemini-3-flash-preview",
          operation: "insights-snapshot" as any,
          inputTokens: data.usageMetadata?.promptTokenCount || 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
          meta: { purpose: "daily-consciousness-report" },
        });
      } catch {}
    }

    const snap = await prisma.insightsSnapshot.create({
      data: {
        sourcesCount: last.sourcesCount,
        analysesCount: last.analysesCount,
        nodesCount: last.nodesCount,
        avgTechniques: last.avgTechniques,
        avgWords: last.avgWords,
        timecodePct: last.timecodePct,
        data: { deltas, snapshotsIn24h: snapshots.length } as any,
        summary,
        kind: "daily-consciousness",
      },
    });

    return NextResponse.json({ ok: true, snapshotId: snap.id, summary, deltas });
  } catch (e: any) {
    console.error("[daily-consciousness-report]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
