import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { rateLimit } from "@/lib/learn/rate-limit";
import { logUsage } from "@/lib/learn/usage-tracker";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SEEDANCE_USD_PER_SEC = 0.047;

const BASE = "https://platform.higgsfield.ai";
const MODEL = "bytedance/seedance/v1.5/pro/text-to-video";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function authHeader(): string | null {
  const id = (process.env.HIGGSFIELD_API_ID ?? "").trim();
  const secret = (process.env.HIGGSFIELD_API_KEY ?? "").trim();
  if (!id || !secret) return null;
  return `Key ${id}:${secret}`;
}

// Use Gemini Flash to turn scene data into a rich Seedance prompt (10s, 8 sections)
async function buildSeedancePrompt(sceneData: {
  sceneNumber: number;
  title: string | null;
  summary: string | null;
  scriptText: string | null;
  directorNotes?: string | null;
  episodeTitle?: string | null;
  episodeNumber?: number;
  characters: Array<{ name: string; description: string }>;
}): Promise<string> {
  if (!GEMINI_API_KEY) {
    // Fallback: simple template
    const chars = sceneData.characters.map((c) => `${c.name}: ${c.description.slice(0, 150)}`).join("\n");
    return `CHARACTER DESIGN: ${chars}\n\nSCENE: ${sceneData.title} (Ep ${sceneData.episodeNumber})\n\n${sceneData.scriptText || sceneData.summary || ""}`.slice(0, 1800);
  }
  const input = {
    sceneNumber: sceneData.sceneNumber,
    sceneTitle: sceneData.title,
    episodeTitle: sceneData.episodeTitle,
    episodeNumber: sceneData.episodeNumber,
    summary: sceneData.summary,
    scriptText: sceneData.scriptText,
    directorNotes: sceneData.directorNotes,
    characters: sceneData.characters,
  };
  const system = `You are an expert AI video prompt engineer for ByteDance Seedance 2. Convert the scene data into a cinematic text-to-video prompt for a 10-SECOND shot. The prompt must contain ALL 8 SECTIONS explicitly:
1. CHARACTER DESIGN (strict — describe each character's face, hair, build, wardrobe, no glasses unless explicitly mentioned)
2. VISUAL STYLE
3. FILM STOCK & LENS
4. COLOR PALETTE & GRADE
5. LIGHTING & ATMOSPHERE
6. AUDIO / SOUND DESIGN
7. TIMELINE — break the 10 seconds into 3-5 timecoded beats [0-2s], [2-4s], [4-6s], [6-8s], [8-10s] with shot type + camera movement + what happens
8. QUALITY BOOSTERS (photoreal 8K, consistent identity, no morphing, no warped hands)

Output ONLY the prompt text (English), no JSON, no markdown fences. 500-700 words. Make Section 7 precise — every beat must advance the plot and preserve character identity.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: `SCENE DATA (JSON):\n${JSON.stringify(input, null, 2)}\n\nReturn the 10-second Seedance prompt now.` }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    }),
  });
  const data: any = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  return text.slice(0, 1800) || "fallback";
}

async function submitSeedance(prompt: string): Promise<{ requestId: string; error?: string }> {
  const auth = authHeader();
  if (!auth) return { requestId: "", error: "HIGGSFIELD creds missing" };
  const body = {
    prompt: prompt.slice(0, 2000),
    aspect_ratio: "16:9",
    duration: 10,
    seed: Math.floor(Math.random() * 1_000_000),
  };
  const res = await fetch(`${BASE}/${MODEL}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { requestId: "", error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const data = await res.json();
  return { requestId: data.request_id ?? data.id ?? "" };
}

export async function POST(req: NextRequest) {
  const ctx = await authenticate(req);
  if (isAuthResponse(ctx)) return ctx;
  const rl = rateLimit(`lab-bulk:${ctx.user.id}`, 2, 600_000); // 2 per 10min — this fires up to 18 clips
  if (!rl.allowed) return NextResponse.json({ error: `rate limit: retry in ${Math.ceil(rl.resetMs / 1000)}s` }, { status: 429 });
  const { seasonId, limit, episodeNumber } = await req.json().catch(() => ({ seasonId: null }));
  if (!seasonId || typeof seasonId !== "string") {
    return NextResponse.json({ error: "seasonId required" }, { status: 400 });
  }
  const sid = seasonId;

  let episodes = await (prisma as any).episode.findMany({
    where: { seasonId: sid, ...(episodeNumber ? { episodeNumber } : {}) },
    orderBy: { episodeNumber: "asc" },
    select: { id: true, episodeNumber: true, title: true },
    ...(limit ? { take: limit } : {}),
  });

  const characters = await (prisma as any).character.findMany({
    where: { seriesId: { not: null } },
    select: { id: true, name: true, appearance: true, roleType: true },
    take: 20,
  });
  const charMap = characters.slice(0, 5).map((c: any) => ({ name: c.name, description: c.appearance || "" }));

  const results: any[] = [];
  for (const ep of episodes) {
    const scene: any = await prisma.scene.findFirst({
      where: { episodeId: ep.id },
      orderBy: { sceneNumber: "asc" },
      select: { id: true, sceneNumber: true, title: true, summary: true, scriptText: true, memoryContext: true },
    });
    if (!scene) continue;
    const directorNotes = (scene.memoryContext as any)?.directorNotes || null;
    const basePrompt = await buildSeedancePrompt({
      sceneNumber: scene.sceneNumber,
      title: scene.title,
      summary: scene.summary,
      scriptText: scene.scriptText,
      directorNotes,
      episodeTitle: ep.title,
      episodeNumber: ep.episodeNumber,
      characters: charMap,
    });
    // Fire 2 variants per scene (different seeds baked into submission)
    const [v1, v2] = await Promise.all([submitSeedance(basePrompt), submitSeedance(basePrompt)]);
    for (const [variant, part] of [[1, v1], [2, v2]] as const) {
      if (!part.error) {
        await logUsage({
          model: MODEL,
          operation: "video-gen",
          videoSeconds: 10,
          meta: { lab: true, bulk: true, episodeId: ep.id, sceneId: scene.id, variant, requestId: part.requestId, usdCostOverride: 10 * SEEDANCE_USD_PER_SEC, userId: ctx.user.id },
        });
      }
    }
    results.push({
      episode: { id: ep.id, number: ep.episodeNumber, title: ep.title },
      scene: { id: scene.id, number: scene.sceneNumber, title: scene.title },
      prompt: basePrompt,
      videos: [
        { variant: 1, requestId: v1.requestId, error: v1.error },
        { variant: 2, requestId: v2.requestId, error: v2.error },
      ],
    });
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}
