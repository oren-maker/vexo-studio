// Continuous-learning loop.
// Reads the last 7 days of ActionOutcome where outcome="rejected" | "error",
// groups by actionType, asks Gemini to summarize what went wrong + propose an
// upgrade, then writes the proposal into BrainUpgradeRequest for human review.
//
// Runs daily at 06:30 UTC — after daily-brain (06:00) so it can piggyback on
// the freshest DailyBrainCache if needed later.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-flash-preview";

async function askGemini(prompt: string): Promise<string | null> {
  if (!API_KEY) return null;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 1500 },
        }),
        signal: AbortSignal.timeout(40_000),
      },
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await (prisma as any).actionOutcome.findMany({
    where: {
      createdAt: { gte: cutoff },
      outcome: { in: ["rejected", "error"] },
    },
    select: { actionType: true, outcome: true, confidence: true, errorMsg: true },
    take: 2000,
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, groups: 0, proposals: 0, note: "No rejections/errors in the last 7 days." });
  }

  // Group by (actionType, outcome) and pick groups with ≥5 occurrences.
  type GroupKey = string;
  type Group = { actionType: string; outcome: string; count: number; meanConf: number; errorSamples: string[] };
  const groups = new Map<GroupKey, Group>();
  for (const row of rows) {
    const key = `${row.actionType}::${row.outcome}`;
    const g: Group = groups.get(key) ?? { actionType: row.actionType, outcome: row.outcome, count: 0, meanConf: 0, errorSamples: [] };
    g.count++;
    if (typeof row.confidence === "number") g.meanConf += row.confidence;
    if (row.errorMsg && g.errorSamples.length < 5) g.errorSamples.push(String(row.errorMsg));
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    g.meanConf = g.count > 0 ? +(g.meanConf / g.count).toFixed(3) : 0;
  }

  const significant = [...groups.values()].filter((g) => g.count >= 5).sort((a, b) => b.count - a.count).slice(0, 5);

  if (significant.length === 0) {
    return NextResponse.json({ ok: true, scanned: rows.length, groups: groups.size, proposals: 0, note: "No action type reached the 5-rejection threshold." });
  }

  // Build one prompt per significant group, ask Gemini to propose an upgrade.
  let proposalsCreated = 0;
  for (const g of significant) {
    const prompt = `
אתה Claude, עוזר דה-באג של מערכת vexo-studio. נתוני תצפית מ-7 הימים האחרונים:

פעולה: ${g.actionType}
תוצאה: ${g.outcome}
כמות: ${g.count}
ביטחון ממוצע של הבמאי: ${(g.meanConf * 100).toFixed(0)}%
${g.errorSamples.length > 0 ? `דוגמאות שגיאה:\n${g.errorSamples.map((e, i) => `${i + 1}. ${e}`).join("\n")}` : ""}

המשימה שלך: הצע שינוי אחד קונקרטי ב-buildSystemPrompt של הבמאי (או ב-executor של הפעולה) שיפחית את שכיחות הדחייה/שגיאה. אל תהיה גנרי. תן שינוי שאפשר לקרוא באמת ולכתוב לפי ההצעה שלך.

פורמט:
כותרת (משפט אחד): ...
שינוי מוצע (מה ולמה, 3-5 שורות): ...
היכן לערוך (קובץ + פונקציה): ...
`.trim();

    const suggestion = await askGemini(prompt);
    if (!suggestion) continue;

    try {
      await prisma.brainUpgradeRequest.create({
        data: {
          instruction: suggestion.slice(0, 2000),
          context: `auto-generated from ActionOutcome: ${g.actionType}/${g.outcome} × ${g.count} in 7d (avg conf ${(g.meanConf * 100).toFixed(0)}%)`.slice(0, 2000),
          status: "pending",
          priority: 4, // brain-suggestion priority
        },
      });
      proposalsCreated++;
    } catch { /* ignore single-row failures */ }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    groups: groups.size,
    significant: significant.length,
    proposals: proposalsCreated,
    topGroups: significant.map((g) => ({ actionType: g.actionType, outcome: g.outcome, count: g.count, meanConfidence: g.meanConf })),
  });
}

export const POST = GET;
