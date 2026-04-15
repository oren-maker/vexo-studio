// Append-only audit log for video merge projects.
// Every meaningful change to a MergeJob (clip add/remove/reorder/trim, transition change,
// audio change, engine change, merge run) writes a row into MergeEdit.

import { prisma } from "./db";

export type MergeEditAction =
  | "clip-added"
  | "clip-removed"
  | "clip-reordered"
  | "clip-trimmed"
  | "transition-changed"
  | "audio-changed"
  | "engine-changed"
  | "merge-started"
  | "merge-completed"
  | "merge-failed"
  | "ai-transition-generated";

export async function logEdit(jobId: string, action: MergeEditAction, details?: any): Promise<void> {
  try {
    await prisma.mergeEdit.create({
      data: { jobId, action, details: details ? (details as any) : undefined },
    });
  } catch {
    // best-effort — never fail the parent op because logging failed
  }
}
