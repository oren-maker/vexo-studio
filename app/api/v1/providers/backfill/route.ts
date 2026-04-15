/**
 * POST /api/v1/providers/backfill
 * Links orphan CostEntry rows (providerId=null) to the right provider by
 * matching the description text. Needed because earlier Sora/OpenAI
 * charges were written before AUTO_CREATE_PROVIDERS knew about OpenAI,
 * so they have a null providerId and don't roll up into the wallets page.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_billing"); if (f) return f;

    const providers = await prisma.provider.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, name: true },
    });
    const byName = (n: string) => providers.find((p) => p.name.toLowerCase().includes(n))?.id;
    const openaiId = byName("openai");
    const geminiId = providers.find((p) => /gemini|google/i.test(p.name))?.id;
    const falId    = byName("fal");

    const orphans = await prisma.costEntry.findMany({
      where: {
        providerId: null,
        OR: [
          { project: { organizationId: ctx.organizationId } },
          { entityType: { in: ["SEASON_OPENING", "SCENE", "FRAME", "CHARACTER_MEDIA", "EPISODE"] } },
        ],
      },
      select: { id: true, description: true },
    });

    const updates: Array<{ id: string; providerId: string }> = [];
    for (const c of orphans) {
      const d = (c.description ?? "").toLowerCase();
      let pid: string | undefined;
      if (openaiId && /sora|openai/i.test(d)) pid = openaiId;
      else if (geminiId && /(gemini|google)/i.test(d)) pid = geminiId;
      else if (falId && /(fal|veo|seedance|kling|vidu|nano-banana|wan|flux)/i.test(d)) pid = falId;
      if (pid) updates.push({ id: c.id, providerId: pid });
    }

    // Batch updates by providerId for efficiency.
    const grouped = new Map<string, string[]>();
    for (const u of updates) {
      if (!grouped.has(u.providerId)) grouped.set(u.providerId, []);
      grouped.get(u.providerId)!.push(u.id);
    }
    let linked = 0;
    for (const [pid, ids] of grouped.entries()) {
      const r = await prisma.costEntry.updateMany({ where: { id: { in: ids } }, data: { providerId: pid } });
      linked += r.count;
    }

    return ok({
      examined: orphans.length,
      linked,
      providers: { openaiId, geminiId, falId },
      remaining: orphans.length - linked,
    });
  } catch (e) { return handleError(e); }
}
