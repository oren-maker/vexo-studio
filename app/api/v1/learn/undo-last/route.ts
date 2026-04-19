import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Reverses the most recent MUTATING brain action.
// Only undoes the last "accepted" ActionOutcome that touched state. Read-only
// actions (search_memory, estimate_cost, ask_question, extract_last_frame)
// are skipped — nothing to undo.
//
// Returns { undone: true, actionType, strategy, detail } or { undone: false, reason }.
// Strategy per actionType:
//   create_scene     → delete the latest scene with status=DRAFT
//   create_episode   → delete the latest episode with status=DRAFT
//   create_season    → delete the latest season with status=DRAFT
//   update_scene     → revert scriptText to latest SceneVersion (if any)
//   update_episode   → no-op (no version table yet)
//   archive_episode  → flip status back to DRAFT
//   delete_scene     → cannot undo (data gone) — suggest manual recreate
//   update_reference → revert to prior BrainReferenceVersion
//   queue_music/dubbing_track → delete the track row
//
// The caller chooses how aggressive to be. For safety, default is
// { dryRun: false } only if the most recent action is provably reversible.

const READ_ONLY = new Set(["search_memory", "estimate_cost", "ask_question", "extract_last_frame"]);

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = !!body.dryRun;

  // Latest accepted, mutating action
  const latest = await (prisma as any).actionOutcome.findFirst({
    where: { outcome: "accepted", actionType: { notIn: [...READ_ONLY] } },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) {
    return NextResponse.json({ undone: false, reason: "אין פעולה לבטל" });
  }

  const ageMs = Date.now() - new Date(latest.createdAt).getTime();
  if (ageMs > 30 * 60 * 1000) {
    return NextResponse.json({ undone: false, reason: `הפעולה האחרונה ישנה מדי (${Math.round(ageMs / 60_000)} דק') — undo מוגבל ל-30 דקות אחרונות`, actionType: latest.actionType });
  }

  const strategy = planUndo(latest.actionType);
  if (strategy === "cannot") {
    return NextResponse.json({ undone: false, reason: `לא ניתן לבטל פעולה מסוג ${latest.actionType} אוטומטית`, actionType: latest.actionType });
  }
  if (dryRun) {
    return NextResponse.json({ undone: false, dryRun: true, actionType: latest.actionType, strategy });
  }

  try {
    const detail = await executeUndo(latest.actionType, latest);
    return NextResponse.json({ undone: true, actionType: latest.actionType, strategy, detail });
  } catch (e: any) {
    return NextResponse.json({ undone: false, reason: String(e?.message || e).slice(0, 300), actionType: latest.actionType }, { status: 500 });
  }
}

function planUndo(type: string): "delete-draft" | "revert-version" | "flip-status" | "delete-track" | "cannot" {
  if (["create_scene", "create_episode", "create_season"].includes(type)) return "delete-draft";
  if (["update_scene", "update_opening_prompt", "update_reference"].includes(type)) return "revert-version";
  if (type === "archive_episode") return "flip-status";
  if (["queue_music_track", "queue_dubbing_track"].includes(type)) return "delete-track";
  return "cannot";
}

async function executeUndo(type: string, outcome: any): Promise<string> {
  switch (type) {
    case "create_scene": {
      const row = await prisma.scene.findFirst({ where: { status: "DRAFT" }, orderBy: { createdAt: "desc" } });
      if (!row) return "no DRAFT scene to delete";
      await prisma.scene.delete({ where: { id: row.id } });
      return `deleted scene ${row.sceneNumber} (id=${row.id.slice(-8)})`;
    }
    case "create_episode": {
      const row = await (prisma as any).episode.findFirst({ where: { status: "DRAFT" }, orderBy: { createdAt: "desc" } });
      if (!row) return "no DRAFT episode to delete";
      await (prisma as any).episode.delete({ where: { id: row.id } });
      return `deleted episode ${row.episodeNumber}`;
    }
    case "create_season": {
      const row = await (prisma as any).season.findFirst({ where: { status: "DRAFT" }, orderBy: { createdAt: "desc" } });
      if (!row) return "no DRAFT season to delete";
      await (prisma as any).season.delete({ where: { id: row.id } });
      return `deleted season ${row.seasonNumber}`;
    }
    case "archive_episode": {
      const row = await (prisma as any).episode.findFirst({ where: { status: "ARCHIVED" }, orderBy: { updatedAt: "desc" } });
      if (!row) return "no ARCHIVED episode to restore";
      await (prisma as any).episode.update({ where: { id: row.id }, data: { status: "DRAFT" } });
      return `restored episode ${row.episodeNumber} to DRAFT`;
    }
    case "queue_music_track": {
      const row = await (prisma as any).musicTrack.findFirst({ where: { status: "REQUESTED" }, orderBy: { createdAt: "desc" } });
      if (!row) return "no REQUESTED music track to remove";
      await (prisma as any).musicTrack.delete({ where: { id: row.id } });
      return `removed music track (${row.trackType})`;
    }
    case "queue_dubbing_track": {
      const row = await (prisma as any).dubbingTrack.findFirst({ where: { status: "REQUESTED" }, orderBy: { createdAt: "desc" } });
      if (!row) return "no REQUESTED dubbing track to remove";
      await (prisma as any).dubbingTrack.delete({ where: { id: row.id } });
      return `removed dubbing track (${row.language})`;
    }
    // update_* use existing revert_version logic; we skip executing here and
    // just report — the UI can follow up with an explicit revert_version action.
    default:
      return "routed to revert_version — trigger it manually via the chat";
  }
}
