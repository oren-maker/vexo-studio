import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// Body: { inputBlobUrl, filename, durationSec?, scenes: [{startSec, endSec, thumbnailUrl}] }
export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const { inputBlobUrl, filename, durationSec, scenes } = body || {};
    if (!inputBlobUrl || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json({ error: "inputBlobUrl + scenes[] required" }, { status: 400 });
    }
    const session = await prisma.trimSession.create({
      data: {
        inputBlobUrl,
        filename: filename || "video.mp4",
        durationSec: durationSec || null,
        status: "ready",
        scenes: {
          create: scenes.map((s: any, i: number) => ({
            startSec: Number(s.startSec) || 0,
            endSec: Number(s.endSec) || 0,
            thumbnailUrl: s.thumbnailUrl || null,
            order: i,
          })),
        },
      },
      include: { scenes: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json({ ok: true, session });
  } catch (e: any) {
    console.error("[trim sessions create]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
