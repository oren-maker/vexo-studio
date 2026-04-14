import { NextRequest } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { AICritic } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await AICritic.reviewScene(params.id));
  } catch (e) { return handleError(e); }
}
