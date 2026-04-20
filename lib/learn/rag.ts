import { prisma } from "./db";
import { embedText, cosineSim } from "./gemini-embeddings";

export type RagHit = {
  id: string;
  title: string | null;
  preview: string;
  score: number;
  type: string; // "instructor_url" | "obsidian" | "upload" | ...
};

// Semantic retrieval of similar LearnSource prompts.
// Returns top-k hits above a minimum similarity threshold so the brain never
// gets told "here's context" when nothing in the library is actually related.
export async function retrieveRelevantSources(query: string, k = 5): Promise<RagHit[]> {
  if (!query || query.trim().length < 6) return [];
  let queryVec: number[];
  try {
    queryVec = await embedText(query);
  } catch {
    return [];
  }
  const sources = await prisma.learnSource.findMany({
    where: { embeddedAt: { not: null }, status: "complete" },
    select: { id: true, title: true, prompt: true, embedding: true, type: true },
    take: 500,
  });
  return sources
    .map((s) => ({
      id: s.id,
      title: s.title,
      preview: s.prompt.slice(0, 220),
      score: cosineSim(queryVec, s.embedding),
      type: s.type,
    }))
    .filter((h) => h.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function formatRagBlock(hits: RagHit[]): string {
  if (hits.length === 0) return "";
  // Split obsidian personal notes from prompt-library hits — the brain should
  // treat them differently (notes = user's own thinking, prompts = inspiration).
  const obsidian = hits.filter((h) => h.type === "obsidian");
  const library = hits.filter((h) => h.type !== "obsidian");

  const fmtHit = (h: RagHit, i: number) => {
    const title = h.title?.slice(0, 80) || "(ללא כותרת)";
    return `${i + 1}. [${(h.score * 100).toFixed(0)}%] "${title}" (id=${h.id})\n   ${h.preview.replace(/\s+/g, " ").slice(0, 180)}...`;
  };

  const parts: string[] = [];
  if (obsidian.length > 0) {
    parts.push(
      `📓 פתקים רלוונטיים מה-Obsidian של אורן (התייחס אליהם כחומר גלם — המחשבות שלו, לא פרומפטים):\n${obsidian.map(fmtHit).join("\n")}`,
    );
  }
  if (library.length > 0) {
    parts.push(
      `🔎 פרומפטים דומים מהספרייה (RAG — השתמש בהשראה, אל תעתיק):\n${library.map(fmtHit).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}
