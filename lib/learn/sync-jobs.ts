// Simple sync-job tracking: create a row, update progress as work happens,
// client polls by id. Reusable across all long-running sync operations.

import { prisma } from "./db";

export async function createJob(operation: string, totalItems = 0, currentStep = "מאתחל…"): Promise<string> {
  const j = await prisma.syncJob.create({
    data: {
      operation,
      status: "running",
      totalItems,
      completedItems: 0,
      currentStep,
    },
  });
  return j.id;
}

export async function updateJob(
  jobId: string,
  data: {
    completedItems?: number;
    totalItems?: number;
    currentStep?: string;
    currentMessage?: string;
    status?: "running" | "complete" | "failed";
    result?: any;
    error?: string;
  },
) {
  try {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        ...data,
        ...(data.status === "complete" || data.status === "failed"
          ? { completedAt: new Date() }
          : {}),
      },
    });
  } catch {}
}

export async function finishJob(jobId: string, result: any): Promise<void> {
  await updateJob(jobId, {
    status: "complete",
    result,
    currentStep: "הושלם",
    currentMessage: "",
  });
}

export async function failJob(jobId: string, error: string): Promise<void> {
  await updateJob(jobId, {
    status: "failed",
    error: error.slice(0, 2000),
    currentStep: "נכשל",
  });
}
