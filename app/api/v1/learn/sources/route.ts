import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { validateUrl } from "@/lib/learn/url-validator";
import { runPipeline } from "@/lib/learn/pipeline";
import { rateLimit, getClientKey } from "@/lib/learn/rate-limit";
import { requireAdmin } from "@/lib/learn/auth";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));

  const where = {
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.learnSource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.learnSource.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

export async function POST(req: NextRequest) {
  const authFail = await requireAdmin(req);
  if (authFail) return authFail;

  const rl = rateLimit(`sources:${getClientKey(req)}`, 10, 3600_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate limit exceeded (10/hour)", resetMs: rl.resetMs },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { url, blobUrl, title, thumbnail, duration, prompt, sourceType, addedBy } = body;

  const videoUrl = blobUrl || url;
  if (!videoUrl) return NextResponse.json({ error: "url/blobUrl נדרש" }, { status: 400 });

  const check = validateUrl(videoUrl);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const source = await prisma.learnSource.create({
    data: {
      type: sourceType || (blobUrl ? "upload" : "instructor_url"),
      url: url || null,
      blobUrl: videoUrl,
      title: title || null,
      thumbnail: thumbnail || null,
      duration: duration || null,
      prompt: prompt ? String(prompt).trim() : "Extract the prompt that generated this video",
      addedBy: addedBy || null,
      status: "pending",
    },
  });

  // Background pipeline - returns immediately, Vercel keeps function alive via waitUntil.
  waitUntil(runPipeline(source.id).catch(() => {}));

  return NextResponse.json(source, { status: 201 });
}
