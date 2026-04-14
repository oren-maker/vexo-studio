import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { getContext } from "@/lib/project-context";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[ch]!);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const c = await getContext(params.id);
    const logs = await prisma.aILog.findMany({
      where: { projectId: params.id, actionType: "CONTEXT_REFRESH" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const url = new URL(req.url);
    const download = url.searchParams.get("download");
    const format = url.searchParams.get("format") ?? (download === "1" ? "json" : null);

    if (format && c) {
      const project = await prisma.project.findUnique({ where: { id: params.id }, select: { name: true } });
      const name = project?.name ?? "series";

      if (format === "json") {
        return new NextResponse(JSON.stringify({ cache: c, logs }, null, 2), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="context-${name}.json"`,
          },
        });
      }

      if (format === "text" || format === "txt") {
        const logLines = logs.map((l) => `- ${new Date(l.createdAt).toISOString()} · ${l.decisionReason ?? ""}`).join("\n");
        const body = [
          `SERIES CONTEXT CACHE — ${name}`,
          `Updated: ${c.updatedAt.toISOString()}`,
          `Tokens: ~${c.tokenCount}`,
          "",
          "=== SUMMARY (what the AI director reads) ===",
          c.summary,
          "",
          "=== RAW DATA (JSON) ===",
          JSON.stringify(c.data, null, 2),
          "",
          "=== REFRESH LOG ===",
          logLines || "(no logs)",
        ].join("\n");
        return new NextResponse(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="context-${name}.txt"`,
          },
        });
      }

      if (format === "pdf" || format === "html") {
        // Printable HTML — user hits Ctrl+P to Save as PDF. Works in every browser,
        // no Chromium-in-serverless headaches.
        const html = `<!doctype html>
<html lang="en" dir="auto">
<head>
<meta charset="utf-8"/>
<title>Context · ${esc(name)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: -apple-system, Segoe UI, Roboto, "Noto Sans Hebrew", sans-serif; line-height: 1.55; color: #222; }
  h1 { font-size: 22pt; margin: 0 0 4pt; }
  h2 { font-size: 14pt; margin-top: 20pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
  .meta { color: #666; font-size: 10pt; margin-bottom: 16pt; }
  pre { white-space: pre-wrap; word-wrap: break-word; background: #f6f6f6; padding: 10pt; border-radius: 6pt; font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  td { padding: 4pt 6pt; border-bottom: 1px solid #eee; vertical-align: top; }
  .toolbar { position: fixed; top: 10px; inset-inline-end: 10px; }
  .toolbar button { font: inherit; padding: 6pt 12pt; border-radius: 6pt; background: #2563eb; color: white; border: 0; cursor: pointer; }
  @media print { .toolbar { display: none; } }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
<h1>${esc(name)}</h1>
<div class="meta">Series context · updated ${esc(c.updatedAt.toISOString())} · ~${c.tokenCount} tokens</div>
<h2>Summary</h2>
<pre>${esc(c.summary)}</pre>
<h2>Structured data</h2>
<pre>${esc(JSON.stringify(c.data, null, 2))}</pre>
<h2>Refresh log</h2>
<table>${logs.map((l) => `<tr><td>${esc(new Date(l.createdAt).toLocaleString())}</td><td>${esc(l.decisionReason ?? "")}</td></tr>`).join("") || "<tr><td>(none)</td></tr>"}</table>
<script>setTimeout(() => window.print(), 500);</script>
</body>
</html>`;
        return new NextResponse(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    return ok({ cache: c, logs });
  } catch (e) { return handleError(e); }
}
