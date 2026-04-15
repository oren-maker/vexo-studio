import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

// POST /api/learn/sources/bulk
// Body: { prompts: [{ title, prompt, videoUrl?, thumbnail?, externalId? }, ...] }
// Upserts by externalId (or creates new without it). No pipeline runs automatically;
// these are treated as pre-made CeDance-style prompts.

type Item = {
  title?: string;
  prompt: string;
  videoUrl?: string;
  thumbnail?: string;
  externalId?: string;
  url?: string;
  addedBy?: string;
};

export async function POST(req: NextRequest) {
  const authFail = await requireAdmin(req);
  if (authFail) return authFail;

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.prompts)) {
    return NextResponse.json(
      { error: "body: {prompts: Array<{title, prompt, videoUrl?, ...}>}" },
      { status: 400 }
    );
  }

  const items = body.prompts as Item[];
  let upserted = 0;
  let created = 0;
  const errors: string[] = [];

  for (const it of items) {
    if (!it.prompt || it.prompt.length < 10) {
      errors.push(`skip: prompt too short`);
      continue;
    }
    try {
      if (it.externalId) {
        await prisma.learnSource.upsert({
          where: { externalId: it.externalId },
          create: {
            type: "cedance",
            prompt: it.prompt,
            title: it.title || null,
            url: it.url || null,
            blobUrl: it.videoUrl || null,
            thumbnail: it.thumbnail || null,
            externalId: it.externalId,
            status: "complete",
            addedBy: it.addedBy || "bulk-import",
          },
          update: {
            prompt: it.prompt,
            title: it.title || null,
            blobUrl: it.videoUrl || null,
            thumbnail: it.thumbnail || null,
          },
        });
        upserted++;
      } else {
        await prisma.learnSource.create({
          data: {
            type: "cedance",
            prompt: it.prompt,
            title: it.title || null,
            url: it.url || null,
            blobUrl: it.videoUrl || null,
            thumbnail: it.thumbnail || null,
            status: "complete",
            addedBy: it.addedBy || "bulk-import",
          },
        });
        created++;
      }
    } catch (e: any) {
      errors.push(String(e.message || e).slice(0, 200));
    }
  }

  return NextResponse.json({ received: items.length, upserted, created, errors });
}
