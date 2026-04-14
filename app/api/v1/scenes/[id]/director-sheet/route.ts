import { NextRequest } from "next/server";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { buildDirectorSheet } from "@/lib/director-sheet";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const sheet = await buildDirectorSheet(params.id);
    return ok({ sceneId: params.id, sheet });
  } catch (e) { return handleError(e); }
}
