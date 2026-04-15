// Parser for https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts
// The README.md contains 1700+ prompts in two sections:
//   - Featured: `### No. X: Title` (6 prompts)
//   - All Prompts: `### Title` (thousands, under "## 🎬 All Prompts" section)
//
// Both use `#### 📝 Prompt\n\n```\n<text>\n```` and have video URLs +
// youmind.com links + Author/Source metadata.

import { prisma } from "./db";

const REPO = "YouMind-OpenLab/awesome-seedance-2-prompts";
const README_URL = `https://raw.githubusercontent.com/${REPO}/main/README.md`;

export type SeedancePrompt = {
  externalId: string;
  title: string;
  description: string;
  prompt: string;
  videoUrl: string | null;
  thumbnail: string | null;
  author: string | null;
  sourceLink: string | null;
  youmindUrl: string | null;
  featured: boolean;
};

export async function fetchReadme(): Promise<string> {
  const res = await fetch(README_URL, {
    headers: { "User-Agent": "vexo-learn-sync" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`README fetch failed: ${res.status}`);
  return res.text();
}

export function parsePromptBlocks(markdown: string): SeedancePrompt[] {
  // Split the whole doc by `\n### ` (top-level prompt heading). First element is intro; skip.
  const parts = markdown.split(/\n### /);
  const results: SeedancePrompt[] = [];

  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];

    // Stop at the next `## ` section (after all prompts), if it leaked in.
    const sectionEnd = block.search(/\n## /);
    const body = sectionEnd === -1 ? block : block.slice(0, sectionEnd);

    // First line = title. May be "No. X: Actual Title" or just "Actual Title".
    const firstLineEnd = body.indexOf("\n");
    const firstLine = firstLineEnd === -1 ? body : body.slice(0, firstLineEnd);
    if (!firstLine.trim()) continue;

    const featuredMatch = firstLine.match(/^No\.\s*(\d+):\s*(.+)$/);
    const featured = !!featuredMatch;
    const title = (featuredMatch ? featuredMatch[2] : firstLine).trim().slice(0, 250);

    // Extract the first fenced code block anywhere in the body (that's the prompt).
    const codeMatch = body.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
    if (!codeMatch) continue;
    const promptText = codeMatch[1].trim();
    if (promptText.length < 20) continue;

    // Description: the blockquote line right after the title (`> text`), or from `#### 📖 Description`.
    let description = "";
    const descBq = body.match(/\n>\s+([^\n]+)/);
    if (descBq) description = descBq[1].trim();
    const descSec = body.match(/####\s*📖\s*Description\s*\n+([\s\S]*?)(?=\n####|$)/);
    if (descSec) description = descSec[1].trim();
    description = description.slice(0, 2000);

    // Video: prefer the releases MP4 link, else the cloudflarestream thumbnail's video, else null.
    let videoUrl: string | null = null;
    const mp4Match = body.match(/https:\/\/github\.com\/[^\s"'<>)]+\/releases\/download\/videos\/\d+\.mp4/);
    if (mp4Match) videoUrl = mp4Match[0];

    // Thumbnail
    const thumbMatch = body.match(/https:\/\/customer-[^\s"'<>)]+\/thumbnails\/thumbnail\.jpg/);
    const thumbnail = thumbMatch ? thumbMatch[0] : null;

    // Youmind URL with id (stable external id)
    const youmindMatch = body.match(/https:\/\/youmind\.com\/[a-zA-Z-]+\/seedance-2-0-prompts\?id=(\d+)/);
    const youmindId = youmindMatch ? youmindMatch[1] : null;
    const youmindUrl = youmindMatch ? youmindMatch[0] : null;

    // Author & source
    const authorMatch = body.match(/\*\*Author:\*\*\s*\[([^\]]+)\]/);
    const sourceMatch = body.match(/\*\*Source:\*\*\s*\[[^\]]+\]\(([^)]+)\)/);

    // External ID: prefer youmind numeric id; else featured No.; else hash of title.
    let externalId: string;
    if (youmindId) externalId = `seedance-${youmindId}`;
    else if (featuredMatch) externalId = `seedance-featured-${featuredMatch[1]}`;
    else {
      // Fallback: slug of title, trimmed
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      externalId = `seedance-${slug}-${i}`;
    }

    results.push({
      externalId,
      title,
      description,
      prompt: promptText,
      videoUrl,
      thumbnail,
      author: authorMatch?.[1] || null,
      sourceLink: sourceMatch?.[1] || null,
      youmindUrl,
      featured,
    });
  }

  return results;
}

export async function syncSeedanceRepo(): Promise<{
  fetched: number;
  upserted: number;
  withVideo: number;
  featured: number;
  errors: string[];
}> {
  const md = await fetchReadme();
  const prompts = parsePromptBlocks(md);

  const errors: string[] = [];
  let upserted = 0;
  let withVideo = 0;
  let featured = 0;

  // Upsert in batches to keep transactions small.
  for (const p of prompts) {
    try {
      await prisma.learnSource.upsert({
        where: { externalId: p.externalId },
        create: {
          type: "cedance",
          prompt: p.prompt,
          title: p.title,
          url: p.youmindUrl || p.videoUrl || `https://github.com/${REPO}`,
          blobUrl: p.videoUrl,
          thumbnail: p.thumbnail,
          externalId: p.externalId,
          status: "complete",
          addedBy: p.author || "seedance-sync",
        },
        update: {
          prompt: p.prompt,
          title: p.title,
          blobUrl: p.videoUrl,
          thumbnail: p.thumbnail,
          url: p.youmindUrl || p.videoUrl || undefined,
          addedBy: p.author || "seedance-sync",
        },
      });
      upserted++;
      if (p.videoUrl) withVideo++;
      if (p.featured) featured++;
    } catch (e: any) {
      errors.push(`${p.externalId}: ${String(e.message || e).slice(0, 200)}`);
    }
  }

  return { fetched: prompts.length, upserted, withVideo, featured, errors };
}
