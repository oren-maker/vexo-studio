import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { Assistant } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().min(1).max(8000),
  system: z.string().max(2000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(4000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const body = Body.parse(await req.json());
    return ok(await Assistant.generate(body.prompt, { system: body.system, temperature: body.temperature, maxTokens: body.maxTokens }));
  } catch (e) { return handleError(e); }
}
