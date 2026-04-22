// DB writer for Self-Healing RAG grader decisions.
// One row per grader invocation — original attempt + every retry.
// priorAttemptId chains the retry sequence for a single user turn so the
// UI can render it as a tree.

import { prisma } from "./db";
import type { GraderVerdict } from "./brain-grader";

export async function logGrading(params: {
  brainMessageId: string;
  chatId: string;
  attemptNumber: number;
  verdict: GraderVerdict;
  reasoning: string;
  originalQuestion: string;
  rewrittenQuestion?: string;
  ragSourceCount: number;
  ragSourceIds: string[];
  answerSnippet?: string;
  graderLatencyMs?: number;
  graderCostUsd?: number;
  priorAttemptId?: string;
}): Promise<{ id: string }> {
  try {
    const row = await prisma.brainGrading.create({
      data: {
        brainMessageId: params.brainMessageId,
        chatId: params.chatId,
        attemptNumber: params.attemptNumber,
        verdict: params.verdict,
        reasoning: params.reasoning.slice(0, 2000),
        originalQuestion: params.originalQuestion.slice(0, 2000),
        rewrittenQuestion: params.rewrittenQuestion?.slice(0, 500) ?? null,
        ragSourceCount: params.ragSourceCount,
        ragSourceIds: params.ragSourceIds,
        answerSnippet: params.answerSnippet?.slice(0, 500) ?? null,
        graderLatencyMs: params.graderLatencyMs ?? null,
        graderCostUsd: params.graderCostUsd ?? 0,
        priorAttemptId: params.priorAttemptId ?? null,
      },
      select: { id: true },
    });
    return row;
  } catch (e: any) {
    // Logging must never break the brain response. Return a dummy id.
    console.warn("[brain-grading-logger] failed:", e?.message ?? e);
    return { id: "" };
  }
}
