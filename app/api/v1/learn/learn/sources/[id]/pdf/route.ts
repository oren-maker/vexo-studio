import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/learn/db";
import { generatePdfBuffer, type PdfSourceData } from "@/lib/learn/pdf-generator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "1";
  const inline = searchParams.get("inline") === "1";

  const source = await prisma.learnSource.findUnique({
    where: { id: params.id },
    include: {
      analysis: { include: { knowledgeNodes: true } },
      parentSource: { select: { id: true, title: true, addedBy: true } },
      children: {
        select: { id: true, title: true, addedBy: true, lineageNotes: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [generatedImages, generatedVideos, apiUsage] = await Promise.all([
    prisma.generatedImage.findMany({
      where: { sourceId: source.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.generatedVideo.findMany({
      where: { sourceId: source.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.apiUsage.aggregate({
      where: { sourceId: source.id },
      _sum: { usdCost: true },
      _count: true,
    }),
  ]);

  const latestImage = generatedImages[0]?.createdAt;
  const isStale =
    !source.pdfGeneratedAt ||
    (latestImage && latestImage > source.pdfGeneratedAt) ||
    source.updatedAt > source.pdfGeneratedAt;

  if (!force && source.pdfBlobUrl && !isStale) {
    return NextResponse.redirect(source.pdfBlobUrl, 302);
  }

  // Parse rawGemini for engine + captionEnglish if available
  let captionEnglish: string | null = null;
  let engine: string | null = null;
  if (source.analysis?.rawGemini) {
    try {
      const raw = JSON.parse(source.analysis.rawGemini);
      if (raw.captionEnglish) captionEnglish = String(raw.captionEnglish);
      if (raw.engine) engine = String(raw.engine);
    } catch {
      // ignore
    }
  }

  const data: PdfSourceData = {
    id: source.id,
    title: source.title,
    url: source.url,
    prompt: source.prompt,
    addedBy: source.addedBy,
    type: source.type,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    thumbnail: source.thumbnail,
    blobUrl: source.blobUrl,
    lineageNotes: source.lineageNotes,
    captionEnglish,
    engine,
    analysis: source.analysis
      ? {
          description: source.analysis.description,
          style: source.analysis.style,
          mood: source.analysis.mood,
          difficulty: source.analysis.difficulty,
          techniques: source.analysis.techniques,
          tags: source.analysis.tags,
          howTo: source.analysis.howTo,
          insights: source.analysis.insights,
          promptAlignment: source.analysis.promptAlignment,
          knowledgeNodes: source.analysis.knowledgeNodes.map((n) => ({
            type: n.type,
            title: n.title,
            body: n.body,
            confidence: n.confidence,
            tags: n.tags,
          })),
        }
      : null,
    generatedImages: generatedImages.map((g) => ({
      blobUrl: g.blobUrl,
      model: g.model,
      usdCost: g.usdCost,
      createdAt: g.createdAt,
    })),
    generatedVideos: generatedVideos.map((v) => ({
      blobUrl: v.blobUrl,
      model: v.model,
      usdCost: v.usdCost,
      durationSec: v.durationSec,
      aspectRatio: v.aspectRatio,
      createdAt: v.createdAt,
      status: v.status,
    })),
    parent: source.parentSource
      ? { id: source.parentSource.id, title: source.parentSource.title, addedBy: source.parentSource.addedBy }
      : null,
    children: source.children.map((c) => ({
      id: c.id,
      title: c.title,
      addedBy: c.addedBy,
      lineageNotes: c.lineageNotes,
      createdAt: c.createdAt,
    })),
    stats: {
      totalCostForSource: apiUsage._sum.usdCost || 0,
      apiCallsForSource: apiUsage._count,
    },
  };

  let buffer: Buffer;
  try {
    buffer = await generatePdfBuffer(data);
  } catch (e: any) {
    return NextResponse.json({ error: `PDF generation failed: ${e.message}` }, { status: 500 });
  }

  const filename = `pdfs/${source.id}-${Date.now()}.pdf`;
  try {
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: "application/pdf",
    });
    await prisma.learnSource.update({
      where: { id: source.id },
      data: { pdfBlobUrl: blob.url, pdfGeneratedAt: new Date() },
    });
    if (inline) {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${safeFilename(source.title || "prompt")}.pdf"`,
        },
      });
    }
    return NextResponse.redirect(blob.url, 302);
  } catch {
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(source.title || "prompt")}.pdf"`,
      },
    });
  }
}

function safeFilename(s: string): string {
  return s.replace(/[^\w\u0590-\u05FF-]+/g, "_").slice(0, 60) || "prompt";
}
