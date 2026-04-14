// Client for vexo-learn service. Pulls reference prompts (Seedance/CeDance) to use
// as style examples in generation pipelines.

type ReferencePrompt = {
  id: string;
  externalId: string | null;
  title: string | null;
  prompt: string;
  videoUrl: string | null;
  thumbnail: string | null;
  sourceUrl: string | null;
};

const BASE_URL = process.env.VEXO_LEARN_URL?.replace(/\/$/, "") || "";
const INTERNAL_KEY = process.env.VEXO_LEARN_INTERNAL_KEY || "";

export async function fetchReferencePrompts(
  query: string,
  limit = 3
): Promise<ReferencePrompt[]> {
  if (!BASE_URL || !INTERNAL_KEY) return [];
  try {
    const url = `${BASE_URL}/api/internal/reference-prompts?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url, {
      headers: { "x-internal-key": INTERNAL_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.items) ? j.items : [];
  } catch {
    return [];
  }
}

// Builds a prompt augmentation string listing reference prompts as style examples.
// Returns empty string if no references available (graceful degradation).
export function buildReferenceContext(references: ReferencePrompt[]): string {
  if (references.length === 0) return "";
  const excerpts = references
    .map((r, i) => {
      const snippet = r.prompt.slice(0, 400).replace(/\s+/g, " ").trim();
      return `Example ${i + 1}${r.title ? ` (${r.title})` : ""}:\n${snippet}`;
    })
    .join("\n\n");
  return `\n\n---\nStyle references from curated Seedance 2.0 prompt library (use as tone/detail-level guide, NOT as subject content):\n\n${excerpts}\n---\n`;
}
