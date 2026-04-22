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
// Fallback chain identical to the main brain call — preview models sometimes
// 5xx or rate-limit, and without a fallback the grader silently fails and
// self-heal decays to "always pass".
const GRADER_MODELS = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-2.5-flash"];

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

**פלט — JSON תקין בלבד. ה-reasoning חייב להיות משפט אחד קצר (עד 120 תווים):**
{
  "verdict": "pass" | "fail" | "n/a",
  "reasoning": "משפט אחד קצר בעברית. עד 120 תווים. ללא פירוט מורחב.",
  "grounded_sources": ["id-של-מקור-1"]  // עד 3 ids. לא ב-n/a.
}`;
}

async function callGraderGemini(prompt: string): Promise<{ raw: string; usage: any; model: string }> {
  let lastErr: any = null;
  for (const model of GRADER_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 3000, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (res.status === 503 || res.status === 429) {
          lastErr = new Error(`grader ${model} ${res.status}`);
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          const t = await res.text();
          lastErr = new Error(`grader ${model} ${res.status}: ${t.slice(0, 200)}`);
          break; // non-transient, try next model
        }
        const json: any = await res.json();
        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!raw) {
          lastErr = new Error(`grader ${model} returned empty`);
          break;
        }
        return { raw, usage: json.usageMetadata, model };
      } catch (e: any) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error("all grader models failed");
}

export async function gradeReply(params: {
  userMessage: string;
  ragHits: RagHit[];
  brainReply: string;
}): Promise<GraderResult> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");
  const t0 = Date.now();
  const prompt = buildGraderPrompt(params.userMessage, params.ragHits, params.brainReply);

  const { raw, usage, model } = await callGraderGemini(prompt);
  const latencyMs = Date.now() - t0;

  // Hebrew JSON output occasionally exceeds maxOutputTokens mid-string, leaving
  // truncated JSON. Fall back to extracting just the verdict via regex — that
  // field is always at the start so it's reliably present even when truncated.
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const verdictMatch = raw.match(/"verdict"\s*:\s*"(pass|fail|n\/a)"/);
    const reasoningMatch = raw.match(/"reasoning"\s*:\s*"([^"]*)"?/);
    if (verdictMatch) {
      parsed = {
        verdict: verdictMatch[1],
        reasoning: (reasoningMatch?.[1] ?? "(reasoning truncated)").slice(0, 200),
        grounded_sources: [],
      };
      console.warn(`[grader] JSON truncated, fell back to regex extraction · verdict=${parsed.verdict}`);
    } else {
      throw new Error(`grader ${model} returned unparseable: ${raw.slice(0, 200)}`);
    }
  }

  const verdict: GraderVerdict = parsed.verdict === "pass" || parsed.verdict === "fail" || parsed.verdict === "n/a" ? parsed.verdict : "fail";
  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 600) : "";
  const groundedSources: string[] = Array.isArray(parsed.grounded_sources)
    ? parsed.grounded_sources.filter((s: any) => typeof s === "string").slice(0, 20)
    : [];

  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;

  await logUsage({
    model,
    operation: "brain-chat-grade",
    inputTokens,
    outputTokens,
    meta: { verdict, ragHitCount: params.ragHits.length },
  });

  // Gemini 3 Flash pricing (approximate): $0.30/M input, $2.50/M output
  const costUsd = (inputTokens / 1_000_000) * 0.30 + (outputTokens / 1_000_000) * 2.50;

  return { verdict, reasoning, groundedSources, latencyMs, costUsd, inputTokens, outputTokens };
}
