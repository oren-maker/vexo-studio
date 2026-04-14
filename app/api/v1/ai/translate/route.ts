import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { groqJson } from "@/lib/groq";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  texts: z.array(z.string().min(1).max(2000)).min(1).max(80),
  target: z.enum(["he", "en"]),
  context: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());
    if (body.target === "en") return ok({ translations: body.texts });

    const sys = `You are a precise UI translator. Translate each English string to natural Hebrew suitable for a SaaS interface. Keep punctuation, emojis, numbers, currency symbols, %, code/identifiers, brand names (VEXO Studio, YouTube, etc.), and short ALL_CAPS tokens unchanged. Preserve placeholders like {name}, %s, $variable. Keep length similar. ${body.context ? `Context: ${body.context}.` : ""} Reply ONLY as JSON: { "translations": ["...", "..."] } in the same order as input.`;
    const j = await groqJson<{ translations: string[] }>(sys, JSON.stringify(body.texts), { temperature: 0.2, maxTokens: 4000 });
    if (!Array.isArray(j.translations) || j.translations.length !== body.texts.length) {
      return NextResponse.json({ statusCode: 502, error: "BadGateway", message: "translation count mismatch" }, { status: 502 });
    }
    return ok({ translations: j.translations });
  } catch (e) { return handleError(e); }
}
