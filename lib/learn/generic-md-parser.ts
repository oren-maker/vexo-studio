// Generic prompt extractor for curated markdown prompt libraries.
// Fetches a raw markdown file, finds all fenced code blocks (the prompts),
// and pulls the nearest preceding H2/H3/H4 as title + preceding paragraph as description.

import { prisma } from "./db";

type ExtractedPrompt = {
  externalId: string;
  title: string;
  description: string;
  prompt: string;
  author: string | null;
  sourceUrl: string | null;
};

export type SyncResult = {
  repo: string;
  fetched: number;
  upserted: number;
  errors: string[];
};

async function fetchRawMarkdown(owner: string, repo: string, path: string, branch = "main"): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // try master branch
    if (branch === "main") return fetchRawMarkdown(owner, repo, path, "master");
    throw new Error(`fetch ${url} → ${res.status}`);
  }
  return res.text();
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

// Extract prompts from markdown. A "prompt" is a fenced code block.
// Title: nearest preceding # / ## / ### / ####.
// Description: non-empty paragraph between the heading and the code block.
export function parseMarkdown(md: string, keyPrefix: string): ExtractedPrompt[] {
  const results: ExtractedPrompt[] = [];
  const lines = md.split("\n");

  let currentTitle = "";
  let currentDesc: string[] = [];
  let currentAuthor: string | null = null;
  let currentSource: string | null = null;
  let inCode = false;
  let codeBuffer: string[] = [];
  let quoteBuffer: string[] = [];
  let promptCounter = 0;

  const seenTexts = new Set<string>();

  const commitText = (text: string, source: "code" | "quote") => {
    const trimmed = text.trim();
    if (trimmed.length < 30) return;
    if (seenTexts.has(trimmed)) return;

    // Word count heuristic: skip short keyword-only blocks
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount < 6) return;

    // Skip things that look like shell/code
    if (source === "code") {
      if (/^(npm |pnpm |yarn |git |cd |sudo |curl |bash|sh)/.test(trimmed)) return;
      if (/^(import |export |const |function |<\/?\w)/m.test(trimmed) && trimmed.length < 500) return;
      if (/^[{[]/.test(trimmed) && trimmed.length < 500) return; // JSON-like short snippets
    }

    promptCounter++;
    const titleBase = currentTitle || "untitled";
    const slug = slugify(titleBase) || `p${promptCounter}`;
    results.push({
      externalId: `${keyPrefix}-${slug}-${promptCounter}`,
      title: titleBase.slice(0, 200),
      description: currentDesc.join(" ").trim().slice(0, 800),
      prompt: trimmed,
      author: currentAuthor,
      sourceUrl: currentSource,
    });
    seenTexts.add(trimmed);
  };

  const flushQuote = () => {
    if (quoteBuffer.length === 0) return;
    // Join consecutive > lines; convert </br> and <br> to spaces
    const joined = quoteBuffer
      .join(" ")
      .replace(/<\/?br\s*\/?>/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    commitText(joined, "quote");
    quoteBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      if (inCode) {
        commitText(codeBuffer.join("\n"), "code");
        codeBuffer = [];
        inCode = false;
      } else {
        flushQuote();
        inCode = true;
        codeBuffer = [];
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Blockquote line
    const qm = line.match(/^>\s?(.*)$/);
    if (qm) {
      const content = qm[1].trim();
      if (content) {
        quoteBuffer.push(content);
      } else {
        flushQuote(); // empty `>` = paragraph break
      }
      continue;
    } else if (quoteBuffer.length > 0) {
      // Non-quote line after a quote block → flush
      flushQuote();
    }

    // Heading
    const hm = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (hm) {
      const title = hm[2]
        .replace(/^[^\w\sא-ת]+\s*/, "") // strip leading emoji/symbols (preserve Hebrew + word chars)
        .replace(/\*\*/g, "")
        .replace(/^\d+[.)]\s*/, "")
        .trim();
      if (
        title.length > 2 &&
        !/^(license|contributing|acknowledgements?|star history|table of contents|how to|usage|quick start|installation|requirements|links|contact|references|alternatives|why)/i.test(title)
      ) {
        currentTitle = title;
        currentDesc = [];
        currentAuthor = null;
        currentSource = null;
      }
      continue;
    }

    // Author/Source metadata
    const authorMatch = line.match(/\*\*Author:?\*\*\s*\[([^\]]+)\]/i);
    if (authorMatch) currentAuthor = authorMatch[1];
    const sourceMatch = line.match(/\*\*Source:?\*\*\s*\[[^\]]*\]\(([^)]+)\)/i);
    if (sourceMatch) currentSource = sourceMatch[1];

    // Accumulate description
    const clean = line
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim();
    if (clean && !clean.startsWith("|") && !clean.startsWith("-") && currentDesc.join(" ").length < 600) {
      currentDesc.push(clean);
    }
  }
  flushQuote();

  return results;
}

export async function syncGenericRepo(opts: {
  owner: string;
  repo: string;
  files: string[]; // e.g. ["README.md"] or multiple
  keyPrefix: string;
  sourceLabel?: string;
}): Promise<SyncResult> {
  const errors: string[] = [];
  let totalFetched = 0;
  let totalUpserted = 0;

  for (const file of opts.files) {
    try {
      const md = await fetchRawMarkdown(opts.owner, opts.repo, file);
      const prompts = parseMarkdown(md, opts.keyPrefix);
      totalFetched += prompts.length;

      for (const p of prompts) {
        try {
          await prisma.learnSource.upsert({
            where: { externalId: p.externalId },
            create: {
              type: "cedance",
              prompt: p.prompt,
              title: p.title,
              url: p.sourceUrl || `https://github.com/${opts.owner}/${opts.repo}/blob/main/${file}`,
              externalId: p.externalId,
              status: "complete",
              addedBy: p.author || opts.sourceLabel || opts.keyPrefix,
            },
            update: {
              prompt: p.prompt,
              title: p.title,
              addedBy: p.author || opts.sourceLabel || opts.keyPrefix,
            },
          });
          totalUpserted++;
        } catch (e: any) {
          errors.push(`${p.externalId}: ${String(e.message || e).slice(0, 150)}`);
        }
      }
    } catch (e: any) {
      errors.push(`${file}: ${e.message}`);
    }
  }

  return {
    repo: `${opts.owner}/${opts.repo}`,
    fetched: totalFetched,
    upserted: totalUpserted,
    errors,
  };
}

// Pre-configured repos — call syncGenericRepo for each
export const REGISTRY = {
  "sora-hr98w": {
    owner: "hr98w",
    repo: "awesome-sora-prompts",
    files: ["README.md", "animating-prompts.md", "video-editting-prompts.md", "image-generation-prompts.md"],
    keyPrefix: "sora-hr98w",
    sourceLabel: "awesome-sora-prompts (hr98w)",
  },
  "sora-xjpp22": {
    owner: "xjpp22",
    repo: "awesome--sora-prompts",
    files: ["README.md"],
    keyPrefix: "sora-xjpp22",
    sourceLabel: "awesome-sora-prompts (xjpp22)",
  },
  "sora-ease": {
    owner: "SoraEase",
    repo: "sora-prompt",
    files: ["README.md"],
    keyPrefix: "sora-ease",
    sourceLabel: "SoraEase",
  },
  "ai-video-geekjourney": {
    owner: "geekjourneyx",
    repo: "awesome-ai-video-prompts",
    files: ["README.md"],
    keyPrefix: "aivideo-geekjourney",
    sourceLabel: "awesome-ai-video-prompts",
  },
} as const;

export type RegistryKey = keyof typeof REGISTRY;

export async function syncAllRegistry(): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const key of Object.keys(REGISTRY) as RegistryKey[]) {
    const cfg = REGISTRY[key];
    const r = await syncGenericRepo({
      owner: cfg.owner,
      repo: cfg.repo,
      files: [...cfg.files],
      keyPrefix: cfg.keyPrefix,
      sourceLabel: cfg.sourceLabel,
    });
    results.push(r);
  }
  return results;
}
