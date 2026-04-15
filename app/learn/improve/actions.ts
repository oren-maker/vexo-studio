"use server";

import { improvePrompt } from "@/lib/learn/gemini-improve";

export async function improveAction(userPrompt: string) {
  try {
    const r = await improvePrompt(userPrompt);
    return { ok: true as const, ...r };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e) };
  }
}
