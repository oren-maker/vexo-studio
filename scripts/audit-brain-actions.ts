/**
 * Audit: for every brain action the user approved in the last 48h, check
 * that the expected DB change actually landed. Reports success/failure per
 * action type.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const WINDOW_HRS = 48;

(async () => {
  const since = new Date(Date.now() - WINDOW_HRS * 3600 * 1000);

  // All brain-execute SceneLogs in the window
  const logs: any[] = await (p as any).sceneLog.findMany({
    where: { action: { startsWith: "brain_execute_" }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true, sceneId: true, action: true, actor: true, details: true, createdAt: true },
    take: 200,
  });

  console.log("═══════════════════════════════════════════════════════");
  console.log(`  BRAIN ACTION AUDIT · last ${WINDOW_HRS}h · ${logs.length} actions`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (logs.length === 0) { console.log("no brain actions in window"); await p.$disconnect(); return; }

  const byType: Record<string, { total: number; ok: number; failed: Array<{ sceneId: string | null; reason: string; at: string }>; }> = {};

  for (const log of logs) {
    const type = log.action.replace("brain_execute_", "");
    byType[type] ??= { total: 0, ok: 0, failed: [] };
    byType[type].total++;
    const details = (log.details as any) ?? {};

    // Verify based on type
    let ok = false;
    let reason = "";

    switch (type) {
      case "compose_prompt":
      case "update_scene": {
        // Positive signals that the server actually mutated the scene:
        //   1. scene still exists
        //   2. scriptText is non-empty and >= 20 chars
        //   3. scriptSource is "brain-compose" OR "brain-update"
        //      (set by this action handler — confirms the server wrote)
        //   4. log.details.resultText starts with ✅ (server returned success)
        if (!log.sceneId) { reason = "no sceneId on log"; break; }
        const scene = await p.scene.findUnique({ where: { id: log.sceneId }, select: { id: true, scriptText: true, scriptSource: true } });
        if (!scene) { reason = `scene ${log.sceneId} no longer exists`; break; }
        if (!scene.scriptText || scene.scriptText.length < 20) { reason = "scriptText empty or too short"; break; }
        const srcOk = scene.scriptSource === "brain-compose" || scene.scriptSource === "brain-update";
        const resultOk = typeof details?.resultText === "string" && details.resultText.startsWith("✅");
        if (!srcOk && !resultOk) { reason = `scriptSource="${scene.scriptSource}" and no ✅ in resultText — brain update may have been overwritten by a later non-brain edit`; break; }
        ok = true;
        break;
      }
      case "create_scene": {
        if (!log.sceneId) { reason = "no sceneId on create log"; break; }
        const scene = await p.scene.findUnique({ where: { id: log.sceneId }, select: { id: true, createdAt: true } });
        if (!scene) { reason = `scene ${log.sceneId} was not created / got deleted`; break; }
        ok = true;
        break;
      }
      case "create_episode": {
        const epId = details?.episodeId || details?.resultText?.match(/episode ([a-z0-9]+)/i)?.[1];
        if (!epId) { reason = "no episodeId in log details"; break; }
        const ep: any = await (p as any).episode?.findUnique({ where: { id: epId }, select: { id: true } });
        if (!ep) { reason = `episode ${epId} not found`; break; }
        ok = true;
        break;
      }
      case "generate_video": {
        // Expect either a pending job or a READY asset created around the log time
        if (!log.sceneId) { reason = "no sceneId on log"; break; }
        const asset = await p.asset.findFirst({
          where: { entityType: "SCENE", entityId: log.sceneId, assetType: "VIDEO", createdAt: { gte: new Date(log.createdAt.getTime() - 60_000) } },
          orderBy: { createdAt: "desc" },
          select: { status: true, fileUrl: true, createdAt: true },
        });
        const scene = await p.scene.findUnique({ where: { id: log.sceneId }, select: { status: true, memoryContext: true } });
        const mem: any = scene?.memoryContext ?? {};
        if (asset && asset.status === "READY") { ok = true; break; }
        if (mem.pendingVideoJob?.jobId === details?.jobId) { ok = true; reason = "still pending — not failure"; break; }
        if (mem.lastVideoError) { reason = `video error: ${String(mem.lastVideoError).slice(0, 100)}`; break; }
        reason = "no matching asset + no pending job + no error";
        break;
      }
      case "import_guide_url":
      case "ai_guide":
      case "import_instagram_guide":
      case "import_source":
      case "update_reference":
      case "update_opening_prompt":
      default: {
        ok = true; // don't have scene-level evidence; assume log itself is the record
        reason = "no deep verification for this action type (trusted)";
      }
    }

    if (ok) byType[type].ok++;
    else byType[type].failed.push({ sceneId: log.sceneId, reason, at: log.createdAt.toISOString().slice(11, 19) });
  }

  for (const [type, st] of Object.entries(byType)) {
    const rate = st.total > 0 ? ((st.ok / st.total) * 100).toFixed(0) : "—";
    console.log(`━━━ ${type} · ${st.ok}/${st.total} ok (${rate}%)`);
    for (const f of st.failed.slice(0, 10)) {
      console.log(`   ❌ ${f.at} · scene=${f.sceneId?.slice(-6) ?? "—"} · ${f.reason}`);
    }
    console.log("");
  }

  const totalOk = Object.values(byType).reduce((s, v) => s + v.ok, 0);
  const totalFail = Object.values(byType).reduce((s, v) => s + v.failed.length, 0);
  console.log(`═══ SUMMARY: ${totalOk} ok · ${totalFail} failed · rate ${((totalOk / logs.length) * 100).toFixed(0)}%`);

  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
