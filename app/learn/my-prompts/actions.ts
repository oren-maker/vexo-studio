"use server";

import { generateCorpusPrompts } from "@/lib/learn/corpus-generator";
import { prisma } from "@/lib/learn/db";
import { revalidatePath } from "next/cache";

export async function generateMoreAction(count = 5) {
  try {
    const results = await generateCorpusPrompts(count);
    revalidatePath("/learn/my-prompts");
    return { ok: true as const, created: results.length };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e) };
  }
}

export async function deleteMyPromptAction(id: string) {
  try {
    await prisma.learnSource.delete({ where: { id } });
    revalidatePath("/learn/my-prompts");
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e) };
  }
}
