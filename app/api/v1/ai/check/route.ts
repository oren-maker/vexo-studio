import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { Assistant } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const Body = z.object({
  text: z.string().min(1).max(8000),
  criteria: z.string().min(2).max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const body = Body.parse(await req.json());
    return ok(await Assistant.check(body.text, body.criteria));
  } catch (e) { return handleError(e); }
}
