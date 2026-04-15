// Vercel-serverless pipeline. Triggered via `waitUntil` from the POST handler
// so the function can return immediately while analysis runs in background.

import { prisma } from "./db";
import { analyzeVideoFromUrl } from "./gemini";
import type { VideoAnalysisResult } from "./gemini";

function extractKnowledgeNodes(
  analysis: VideoAnalysisResult
): Array<{ type: string; title: string; body: string; tags: string[]; confidence: number }> {
  const nodes: Array<{ type: string; title: string; body: string; tags: string[]; confidence: number }> = [];

  for (const t of analysis.techniques) {
    nodes.push({
      type: "technique",
      title: t.slice(0, 120),
      body: `Technique observed in video: ${t}`,
      tags: [...analysis.tags, analysis.style || ""].filter(Boolean),
      confidence: analysis.promptAlignment ? analysis.promptAlignment / 10 : 0.8,
    });
  }
  if (analysis.style) {
    nodes.push({
      type: "style",
      title: `Style: ${analysis.style}`,
      body: analysis.description,
      tags: [analysis.style, analysis.mood || "", ...analysis.tags].filter(Boolean),
      confidence: 0.85,
    });
  }
  for (const step of analysis.howTo) {
    nodes.push({
      type: "how_to",
      title: step.slice(0, 120),
      body: step,
      tags: analysis.tags,
      confidence: 0.75,
    });
  }
  for (const ins of analysis.insights) {
    nodes.push({
      type: "insight",
      title: ins.slice(0, 120),
      body: ins,
      tags: analysis.tags,
      confidence: 0.8,
    });
  }
  return nodes;
}

export async function runPipeline(sourceId: string): Promise<void> {
  const source = await prisma.learnSource.findUnique({ where: { id: sourceId } });
  if (!source || !source.blobUrl) return;

  try {
    await prisma.learnSource.update({
      where: { id: sourceId },
      data: { status: "processing" },
    });

    const { analysis, raw } = await analyzeVideoFromUrl(source.blobUrl, source.prompt);

    const savedAnalysis = await prisma.videoAnalysis.create({
      data: {
        sourceId,
        description: analysis.description,
        techniques: analysis.techniques,
        howTo: analysis.howTo,
        tags: analysis.tags,
        style: analysis.style,
        mood: analysis.mood,
        difficulty: analysis.difficulty,
        insights: analysis.insights,
        promptAlignment: analysis.promptAlignment,
        rawGemini: raw,
      },
    });

    const nodes = extractKnowledgeNodes(analysis);
    if (nodes.length > 0) {
      await prisma.knowledgeNode.createMany({
        data: nodes.map((n) => ({
          type: n.type,
          title: n.title,
          body: n.body,
          tags: n.tags,
          confidence: n.confidence,
          analysisId: savedAnalysis.id,
        })),
      });
    }

    await prisma.learnSource.update({
      where: { id: sourceId },
      data: { status: "complete" },
    });
  } catch (e: any) {
    await prisma.learnSource.update({
      where: { id: sourceId },
      data: { status: "failed", error: String(e.message || e).slice(0, 500) },
    });
  }
}
