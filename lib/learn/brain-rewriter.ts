// Brain rewriter — Self-Healing RAG "Rewrite Question" node.
// Only runs after the grader returned "fail". Takes the original user query
// + grader's reason for rejecting the answer, and produces a reformulated
// query that should match the knowledge base better.
//
// The rewrite is what feeds the NEXT retrieve→generate cycle.

import { logUsage } from "./usage-tracker";
import type { RagHit } from "./rag";

const API_KEY = process.env.GEMINI_API_KEY;
// Same fallback chain as the brain + grader — preview models occasionally
// 5xx or throttle, and a silent failure here decays the retry loop into
// an instant giveup.
const REWRITER_MODELS = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-2.5-flash"];

export type RewriterResult = {
  rewrittenQuestion: string;
  latencyMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

function buildRewriterPrompt(originalQuery: string, graderReasoning: string, ragHits: RagHit[]): string {
  const hitsHint = ragHits.length === 0
    ? "(לא נשלפו מקורות)"
    : ragHits.slice(0, 5).map((h) => `- ${h.title ?? "ללא כותרת"}: ${h.preview.slice(0, 120)}`).join("\n");

  return `המוח עונה על שאלות על בסיס מאגר הידע של vexo-studio. הוא ניסה לענות על השאלה הבאה אבל ה-grader דחה את התשובה.

**שאלה מקורית:**
${originalQuery}

**למה התשובה נדחתה:**
${graderReasoning}

**המקורות שהיו זמינים (אך לא הספיקו):**
${hitsHint}

**המשימה שלך:** לנסח מחדש את השאלה בעברית בצורה שתעזור ל-retrieval למצוא מקורות טובים יותר. זה לא אומר לשנות את הכוונה — אלא לשפר את הניסוח:
- להוסיף מילות מפתח שסביר שיופיעו במקורות
- להסיר עמימות (אם השאלה רחבה מדי)
- לשבור שאלה מורכבת לגרעין הקריטי

**פלט — JSON בלבד:**
{
  "rewritten_question": "הניסוח החדש של השאלה בעברית, בשורה אחת."
}`;
}

async function callRewriterGemini(prompt: string): Promise<{ raw: string; usage: any; model: string }> {
  let lastErr: any = null;
  for (const model of REWRITER_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 500, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (res.status === 503 || res.status === 429) {
          lastErr = new Error(`rewriter ${model} ${res.status}`);
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          const t = await res.text();
          lastErr = new Error(`rewriter ${model} ${res.status}: ${t.slice(0, 200)}`);
          break;
        }
        const json: any = await res.json();
        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!raw) {
          lastErr = new Error(`rewriter ${model} returned empty`);
          break;
        }
        return { raw, usage: json.usageMetadata, model };
      } catch (e: any) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error("all rewriter models failed");
}

export async function rewriteQuery(params: {
  originalQuery: string;
  graderReasoning: string;
  ragHits: RagHit[];
}): Promise<RewriterResult> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");
  const t0 = Date.now();
  const prompt = buildRewriterPrompt(params.originalQuery, params.graderReasoning, params.ragHits);

  const { raw, usage, model } = await callRewriterGemini(prompt);
  const latencyMs = Date.now() - t0;

  let parsed: any;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`rewriter ${model} returned non-JSON: ${raw.slice(0, 200)}`); }

  const rewrittenQuestion = (typeof parsed.rewritten_question === "string" ? parsed.rewritten_question : "").trim().slice(0, 500);
  if (!rewrittenQuestion) throw new Error(`rewriter ${model} returned empty rewritten_question`);

  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;

  await logUsage({
    model,
    operation: "brain-chat-rewrite",
    inputTokens,
    outputTokens,
  });

  const costUsd = (inputTokens / 1_000_000) * 0.30 + (outputTokens / 1_000_000) * 2.50;

  return { rewrittenQuestion, latencyMs, costUsd, inputTokens, outputTokens };
}
