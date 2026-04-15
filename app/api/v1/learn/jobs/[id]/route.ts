import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const job = await prisma.syncJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  const elapsedSec = Math.round((Date.now() - job.startedAt.getTime()) / 1000);
  const progressPct =
    job.totalItems > 0
      ? Math.min(100, Math.round((job.completedItems / job.totalItems) * 100))
      : job.status === "complete"
      ? 100
      : 0;
  return NextResponse.json({
    id: job.id,
    operation: job.operation,
    status: job.status,
    totalItems: job.totalItems,
    completedItems: job.completedItems,
    currentStep: job.currentStep,
    currentMessage: job.currentMessage,
    progressPct,
    result: job.result,
    error: job.error,
    elapsedSec,
  });
}
