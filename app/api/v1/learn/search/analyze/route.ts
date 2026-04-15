import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { runPipeline } from "@/lib/learn/pipeline";
import { validateUrl } from "@/lib/learn/url-validator";
import { rateLimit, getClientKey } from "@/lib/learn/rate-limit";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const rl = rateLimit(`analyze:${getClientKey(req)}`, 5, 3600_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate limit exceeded (5/hour)" }, { status: 429 });
  }

  const { downloadUrl, title, thumbnail, duration, prompt, addedBy } = await req.json();
  if (!downloadUrl || !prompt) return NextResponse.json({ error: "downloadUrl + prompt נדרשים" }, { status: 400 });

  const check = validateUrl(downloadUrl);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const source = await prisma.learnSource.create({
    data: {
      type: "free_api",
      url: downloadUrl,
      blobUrl: downloadUrl,
      title: title || null,
      thumbnail: thumbnail || null,
      duration: duration || null,
      prompt: String(prompt).trim(),
      addedBy: addedBy || null,
      status: "pending",
    },
  });

  waitUntil(runPipeline(source.id).catch(() => {}));

  return NextResponse.json(source, { status: 201 });
}
