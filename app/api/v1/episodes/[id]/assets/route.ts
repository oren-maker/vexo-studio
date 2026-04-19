import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";

// Lists Asset rows attached to the episode. Supports ?type=THUMBNAIL |
// RECAP | VIDEO filter so UI cards can fetch exactly what they need.
// Newest-first. Bounded to 50.

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    void ctx;
    const type = new URL(req.url).searchParams.get("type");
    const assets = await prisma.asset.findMany({
      where: {
        entityType: "EPISODE",
        entityId: params.id,
        ...(type ? { assetType: type } : {}),
        status: "READY",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, fileUrl: true, thumbnailUrl: true, mimeType: true, assetType: true, createdAt: true, metadata: true, durationSeconds: true },
    });
    return ok({ assets });
  } catch (e) { return handleError(e); }
}
