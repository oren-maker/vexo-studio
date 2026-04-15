/**
 * GET /api/v1/characters/[id]/log
 * Change history for a character:
 *   - Character edits (AuditLog on the Character row)
 *   - Gallery image generations (CharacterMedia CREATE / CostEntry)
 *   - Any AI call tagged to this character
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;

    const character = await prisma.character.findFirst({
      where: { id: params.id, project: { organizationId: ctx.organizationId } },
      select: { id: true, name: true, projectId: true },
    });
    if (!character) throw Object.assign(new Error("character not found"), { statusCode: 404 });

    const mediaRows = await prisma.characterMedia.findMany({
      where: { characterId: character.id },
      select: { id: true, createdAt: true, fileUrl: true, mediaType: true, metadata: true },
      orderBy: { createdAt: "desc" },
    });
    const mediaIds = mediaRows.map((m) => m.id);

    const [audits, costs] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          organizationId: ctx.organizationId,
          OR: [
            { entityType: "Character", entityId: character.id },
            { entityType: "CharacterMedia", entityId: { in: mediaIds.length > 0 ? mediaIds : ["__none__"] } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { actor: { select: { fullName: true, email: true } } },
      }),
      prisma.costEntry.findMany({
        where: {
          projectId: character.projectId,
          OR: [
            { entityType: "CHARACTER_MEDIA", entityId: { in: mediaIds.length > 0 ? mediaIds : ["__none__"] } },
            { entityType: "CHARACTER", entityId: character.id },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    type Row = { id: string; at: string; kind: string; title: string; detail: string | null; actor: string | null };
    const rows: Row[] = [];

    for (const m of mediaRows) {
      const angle = (m.metadata as { angle?: string } | null)?.angle;
      rows.push({
        id: `media-${m.id}`,
        at: m.createdAt.toISOString(),
        kind: "media-created",
        title: angle ? `🖼 תמונה נוספה · ${angle}` : "🖼 תמונה נוספה",
        detail: m.fileUrl,
        actor: null,
      });
    }
    for (const a of audits) {
      const action = a.action.toLowerCase();
      const actor = a.actor?.fullName ?? a.actor?.email ?? null;
      if (a.entityType === "Character") {
        rows.push({
          id: `audit-${a.id}`,
          at: a.createdAt.toISOString(),
          kind: `character-${action}`,
          title: action === "update" ? "✏ הדמות נערכה" : action === "create" ? "✨ הדמות נוצרה" : `דמות · ${action}`,
          detail: (a.newValue as { name?: string; appearance?: string } | null)?.appearance?.slice(0, 200) ?? null,
          actor,
        });
      } else if (a.entityType === "CharacterMedia") {
        rows.push({
          id: `audit-${a.id}`,
          at: a.createdAt.toISOString(),
          kind: `media-${action}`,
          title: action === "update" ? "✏ תמונה עודכנה" : action === "create" ? "✨ תמונה נוצרה" : `תמונה · ${action}`,
          detail: null,
          actor,
        });
      }
    }
    for (const c of costs) {
      rows.push({
        id: `cost-${c.id}`,
        at: c.createdAt.toISOString(),
        kind: "cost",
        title: `💰 ${c.description ?? c.costCategory}`,
        detail: `$${c.totalCost.toFixed(4)}`,
        actor: null,
      });
    }

    // Dedupe by id + sort
    const seen = new Set<string>();
    const unique = rows.filter((r) => !seen.has(r.id) && (seen.add(r.id), true));
    unique.sort((a, b) => b.at.localeCompare(a.at));
    return ok(unique);
  } catch (e) { return handleError(e); }
}
