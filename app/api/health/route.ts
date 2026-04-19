import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public health check. No auth required — reachable by uptime monitors
// (Better Stack / Checkly / Pingdom). Aggregates liveness of each
// critical dependency and returns 200 only when every one is OK.

type Check = { name: string; ok: boolean; latencyMs: number; detail?: string };

async function timeIt<T>(name: string, fn: () => Promise<T>): Promise<Check> {
  const started = Date.now();
  try {
    await fn();
    return { name, ok: true, latencyMs: Date.now() - started };
  } catch (e: any) {
    return { name, ok: false, latencyMs: Date.now() - started, detail: String(e?.message || e).slice(0, 200) };
  }
}

export async function GET() {
  const checks = await Promise.all([
    timeIt("postgres", () => prisma.$queryRaw`SELECT 1`),
    timeIt("gemini", async () => {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!r.ok) throw new Error(`gemini ${r.status}`);
    }),
    timeIt("openai", async () => {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) throw new Error(`openai ${r.status}`);
    }),
    timeIt("blob", async () => {
      if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN missing");
      // Vercel Blob has no dedicated health endpoint — we only verify
      // the token is present + well-formed. A real round-trip would
      // cost a put, skipped.
      if (!/^vercel_blob_rw_/.test(process.env.BLOB_READ_WRITE_TOKEN)) throw new Error("malformed BLOB_READ_WRITE_TOKEN");
    }),
  ]);

  const allOk = checks.every((c) => c.ok);
  return NextResponse.json({
    ok: allOk,
    checks,
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 });
}
