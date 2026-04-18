import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Lab helper: find Maya character + return her reference images.
export async function GET() {
  try {
    const maya = await (prisma as any).character.findFirst({
      where: {
        OR: [
          { name: { contains: "Maya", mode: "insensitive" } },
          { name: { contains: "מאיה", mode: "insensitive" } },
        ],
      },
      include: { media: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    if (!maya) return NextResponse.json({ error: "Maya not found", tried: ["Maya", "מאיה"] }, { status: 404 });
    return NextResponse.json({
      id: maya.id,
      name: maya.name,
      appearance: maya.appearance,
      media: maya.media.map((m: any) => ({
        id: m.id,
        fileUrl: m.fileUrl,
        mediaType: m.mediaType,
        tags: m.tags,
        createdAt: m.createdAt,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
