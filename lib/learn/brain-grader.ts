// Brain grader — Self-Healing RAG "Grade Answer" node.
// Takes the brain's reply + the RAG hits that fed it, and decides whether
// the reply is actually grounded in those sources. Three verdicts:
//   - "pass": answer is fully supported by at least one of the provided sources
//   - "fail": answer claims knowledge that cannot be verified from the sources
//            (hallucination, extrapolation, or mixed-in training data)
//   - "n/a":  this wasn't a knowledge question — it was style/opinion/action/
//            small-talk. Grader should not force grounding onto these.
//
// Only "fail" triggers a rewrite-and-retry in the caller.

import { logUsage } from "./usage-tracker";
import type { RagHit } from "./rag";

const API_KEY = process.env.GEMINI_API_KEY;
const GRADER_MODEL = "gemini-3-flash-preview";

export type GraderVerdict = "pass" | "fail" | "n/a";

export type GraderResult = {
  verdict: GraderVerdict;
  reasoning: string;
  groundedSources: string[]; // ids of RagHits actually cited
  latencyMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

function buildGraderPrompt(userMessage: string, ragHits: RagHit[], brainReply: string): string {
  const hitsBlock = ragHits.length === 0
    ? "(לא נשלפו מקורות — הצ׳אט פעל בלי RAG)"
    : ragHits.map((h, i) => `[${i + 1}] id=${h.id} title="${h.title ?? "ללא כותרת"}" type=${h.type}\n${h.preview}`).join("\n\n---\n\n");

  return `אתה grader קשיח של סוכן RAG. תפקידך להחליט אם תשובת הסוכן נתמכת במקורות שנשלפו, לא לכתוב תשובה משלך.

**שאלת המשתמש:**
${userMessage}

**מקורות שנשלפו (RAG context):**
${hitsBlock}

**תשובת הסוכן:**
${brainReply}

**החלטה — 3 ורדיקטים אפשריים:**

1. \`pass\` — כל טענה עובדתית בתשובה נתמכת ישירות לפחות במקור אחד למעלה. הסוכן לא הוסיף מידע חיצוני.

2. \`fail\` — התשובה מכילה טענה עובדתית שלא ניתן לאמת מהמקורות: הלוצינציה, השלמה מתוך הידע הפנימי של המודל, או ערבוב מידע חיצוני. **גם אם התשובה נכונה "בעולם האמיתי" — אם היא לא מבוססת על המקורות שסופקו, זה fail.**

3. \`n/a\` — **זו לא שאלת ידע.** זוהי בקשת סגנון/דעה/פעולה/small-talk (לדוגמה: "תכתוב לי הודעה", "מה דעתך על X", "תעשה Y", "היי", "תודה"). שאלות כאלה לא צריכות לעבור בדיקת grounding.

**פלט — JSON תקין בלבד:**
{
  "verdict": "pass" | "fail" | "n/a",
  "reasoning": "משפט אחד-שניים בעברית שמסביר למה בחרת בוורדיקט הזה",
  "grounded_sources": ["id-של-מקור-1", "id-של-מקור-2"]  // רק ה-ids של המקורות שבאמת השתמשו בהם. לא ב-n/a.
}`;
}

export async function gradeReply(params: {
  userMessage: string;
  ragHits: RagHit[];
  brainReply: string;
}): Promise<GraderResult> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");
  const t0 = Date.now();
  const prompt = buildGraderPrompt(params.userMessage, params.ragHits, params.brainReply);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GRADER_MODEL}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1000, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`grader ${res.status}: ${err.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!raw) throw new Error("grader returned empty");

  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`grader returned non-JSON: ${raw.slice(0, 200)}`); }

  const verdict: GraderVerdict = parsed.verdict === "pass" || parsed.verdict === "fail" || parsed.verdict === "n/a" ? parsed.verdict : "fail";
  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 600) : "";
  const groundedSources: string[] = Array.isArray(parsed.grounded_sources)
    ? parsed.grounded_sources.filter((s: any) => typeof s === "string").slice(0, 20)
    : [];

  const inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0;

  await logUsage({
    model: GRADER_MODEL,
    operation: "brain-chat-grade",
    inputTokens,
    outputTokens,
    meta: { verdict, ragHitCount: params.ragHits.length },
  });

  // Gemini 3 Flash Preview pricing (approximate): $0.30/M input, $2.50/M output
  const costUsd = (inputTokens / 1_000_000) * 0.30 + (outputTokens / 1_000_000) * 2.50;

  return { verdict, reasoning, groundedSources, latencyMs, costUsd, inputTokens, outputTokens };
}
