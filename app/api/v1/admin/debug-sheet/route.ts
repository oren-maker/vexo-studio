/** Debug: time each step of director-sheet to find the bottleneck. */
import { NextRequest } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const url = new URL(req.url);
    const sceneId = url.searchParams.get("sceneId") ?? "";
    const t: Record<string, number> = {};
    const mark = (k: string, t0: number) => { t[k] = Date.now() - t0; };

    let t0 = Date.now();
    const scene = await prisma.scene.findUnique({ where: { id: sceneId }, select: { id: true, episodeId: true, scriptText: true, summary: true, sceneNumber: true, title: true, memoryContext: true } });
    mark("scene_findUnique", t0);
    if (!scene) return ok({ error: "scene not found", t });

    t0 = Date.now();
    const fullInclude = await prisma.scene.findUnique({
      where: { id: sceneId },
      include: { frames: true, episode: { include: { season: { include: { series: true } }, characters: { include: { character: { include: { media: true } } } } } } },
    });
    mark("scene_full_include", t0);

    t0 = Date.now();
    const ping = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`, { signal: AbortSignal.timeout(5000) }).catch((e) => ({ ok: false, status: 0, text: () => Promise.resolve(String(e)) }) as Response);
    mark("gemini_ping", t0);

    t0 = Date.now();
    const gemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Reply with JSON {ok:true}" }] },
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 50 },
      }),
      signal: AbortSignal.timeout(20000),
    }).catch((e) => ({ ok: false, status: 0, text: () => Promise.resolve(String(e)) }) as Response);
    mark("gemini_call", t0);
    const geminiText = await gemini.text();

    return ok({
      timings: t,
      gemini: { ok: gemini.ok, status: gemini.status, body: geminiText.slice(0, 200) },
      ping: { ok: ping.ok, status: ping.status },
      sceneFound: !!fullInclude,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
    });
  } catch (e) { return handleError(e); }
}
