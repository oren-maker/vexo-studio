// CeDance GitHub sync. Expects repo/path configured in env or passed in.
// Accepts JSON/YAML/MD files containing prompt entries.

import { prisma } from "./db";

type GitHubFile = {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  download_url: string | null;
  content?: string;
  encoding?: string;
};

function parsePromptFile(content: string, fileName: string): { prompt: string; title: string } | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (fileName.endsWith(".json")) {
    try {
      const j = JSON.parse(trimmed);
      const prompt = j.prompt || j.text || j.description || "";
      if (!prompt) return null;
      return { prompt: String(prompt), title: j.title || j.name || fileName };
    } catch {
      return null;
    }
  }

  // Treat .md/.yaml/.txt as plain-text prompts. First line becomes title.
  const lines = trimmed.split("\n");
  const title = (lines[0] || fileName).replace(/^#+\s*/, "").slice(0, 120);
  return { prompt: trimmed, title };
}

export async function syncCeDanceRepo(opts: {
  owner: string;
  repo: string;
  path: string;
  token?: string;
}): Promise<{ fetched: number; upserted: number; errors: string[] }> {
  const { owner, repo, path, token } = opts;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);

  const files: GitHubFile[] = await res.json();
  const errors: string[] = [];
  let upserted = 0;

  for (const f of files) {
    if (f.type !== "file" || !/\.(json|md|markdown|yaml|yml|txt)$/i.test(f.name)) continue;

    try {
      let content: string;
      if (f.content && f.encoding === "base64") {
        content = Buffer.from(f.content, "base64").toString("utf-8");
      } else if (f.download_url) {
        const r = await fetch(f.download_url);
        content = await r.text();
      } else continue;

      const parsed = parsePromptFile(content, f.name);
      if (!parsed) continue;

      await prisma.learnSource.upsert({
        where: { externalId: f.sha },
        create: {
          type: "cedance",
          prompt: parsed.prompt,
          title: parsed.title,
          url: `https://github.com/${owner}/${repo}/blob/main/${f.path}`,
          externalId: f.sha,
          status: "complete", // CeDance items are ready-to-serve prompts; no video pipeline
        },
        update: {
          prompt: parsed.prompt,
          title: parsed.title,
        },
      });
      upserted++;
    } catch (e: any) {
      errors.push(`${f.name}: ${e.message}`);
    }
  }

  return { fetched: files.length, upserted, errors };
}
