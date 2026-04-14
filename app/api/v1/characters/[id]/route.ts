import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const CharacterUpdate = z.object({
  name: z.string().optional(), roleType: z.string().optional(),
  characterType: z.enum(["HUMAN","ANIMATED","NARRATOR"]).optional(),
  appearance: z.string().optional(), personality: z.string().optional(),
  continuityLock: z.boolean().optional(),
  personalityPrompt: z.string().optional(), behaviorPrompt: z.string().optional(),
}).partial();

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const c = await prisma.character.findFirst({
      where: { id: params.id, project: { organizationId: ctx.organizationId } },
      include: { media: { orderBy: { createdAt: "asc" } }, voices: true, project: { select: { id: true, name: true } } },
    });
    if (!c) throw Object.assign(new Error("character not found"), { statusCode: 404 });
    return ok(c);
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    return ok(await prisma.character.update({ where: { id: params.id }, data: CharacterUpdate.parse(await req.json()) }));
  } catch (e) { return handleError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await prisma.characterMedia.deleteMany({ where: { characterId: params.id } });
    await prisma.characterVoice.deleteMany({ where: { characterId: params.id } });
    await prisma.episodeCharacter.deleteMany({ where: { characterId: params.id } });
    await prisma.character.delete({ where: { id: params.id } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
