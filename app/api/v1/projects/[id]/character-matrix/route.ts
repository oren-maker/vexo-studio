import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";

// Character co-appearance matrix for a project.
// For each pair of characters, counts how many episodes they both appear
// in (via EpisodeCharacter). Diagonal = their own episode count. Output
// is ready for a heatmap render.

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrRes = await authenticate(req); if (isAuthResponse(ctxOrRes)) return ctxOrRes;
    void ctxOrRes;

    const chars = await prisma.character.findMany({
      where: { projectId: params.id },
      select: {
        id: true,
        name: true,
        roleType: true,
        appearances: { select: { episodeId: true } },
      },
      orderBy: { name: "asc" },
    });

    // Build episodeId → characterId[] lookup
    const episodeToChars = new Map<string, Set<string>>();
    for (const c of chars) {
      for (const a of c.appearances) {
        const arr = episodeToChars.get(a.episodeId) ?? new Set<string>();
        arr.add(c.id);
        episodeToChars.set(a.episodeId, arr);
      }
    }

    // Pair counts
    const pairs: Record<string, number> = {};
    for (const s of episodeToChars.values()) {
      const ids = [...s];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i; j < ids.length; j++) {
          const a = ids[i], b = ids[j];
          const key = a < b ? `${a}::${b}` : `${b}::${a}`;
          pairs[key] = (pairs[key] ?? 0) + 1;
        }
      }
    }

    return ok({
      characters: chars.map((c) => ({ id: c.id, name: c.name, roleType: c.roleType, episodeCount: c.appearances.length })),
      pairs, // key is "idA::idB" (sorted), value is shared-episode count
      totalEpisodes: episodeToChars.size,
    });
  } catch (e) { return handleError(e); }
}
