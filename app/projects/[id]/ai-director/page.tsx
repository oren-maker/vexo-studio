"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Director = { id: string; mode: string; learningEnabled: boolean; autopilotEnabled: boolean; experienceScore: number };
type Log = { id: string; actorType: string; actionType: string; createdAt: string; decisionReason: string | null; successScore: number | null };

export default function AIDirectorPage() {
  const { id } = useParams<{ id: string }>();
  const [director, setDirector] = useState<Director | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);

  async function load() {
    setDirector(await api(`/api/v1/projects/${id}/ai-director`));
    setLogs(await api(`/api/v1/projects/${id}/ai-logs`).catch(() => []));
  }
  useEffect(() => { load(); }, [id]);

  async function update(body: Partial<Director>) {
    await api(`/api/v1/projects/${id}/ai-director`, { method: "PATCH", body });
    load();
  }

  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{ action: string; reason: string; executed?: Record<string, number> } | null>(null);

  async function run() {
    setBusy(true);
    setLastResult(null);
    try {
      const r = await api<{ action: string; reason: string; executed?: Record<string, number> }>(`/api/v1/projects/${id}/ai-director/run`, { method: "POST" });
      setLastResult(r);
      await load();
    } catch (e: unknown) {
      setLastResult({ action: "ERROR", reason: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!director) return <div className="text-text-muted">Loading…</div>;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">AI Director</h1>
      <Card title="Configuration" subtitle="The autonomous production agent for this project">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Mode</div>
              <div className="text-xs text-text-muted">MANUAL · ASSISTED · AUTOPILOT</div>
            </div>
            <select value={director.mode} onChange={(e) => update({ mode: e.target.value })} className="px-3 py-2 rounded-lg border border-bg-main"><option>MANUAL</option><option>ASSISTED</option><option>AUTOPILOT</option></select>
          </div>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-semibold">Learning enabled</div>
              <div className="text-xs text-text-muted">Director learns from approvals/rejections.</div>
            </div>
            <input type="checkbox" checked={director.learningEnabled} onChange={(e) => update({ learningEnabled: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-semibold">Autopilot enabled</div>
              <div className="text-xs text-text-muted">Director runs the production loop unattended.</div>
            </div>
            <input type="checkbox" checked={director.autopilotEnabled} onChange={(e) => update({ autopilotEnabled: e.target.checked })} />
          </label>
          <div className="flex justify-between items-center">
            <div className="text-xs text-text-muted">Experience score: <span className="num font-bold">{director.experienceScore.toFixed(2)}</span></div>
            <button disabled={busy} onClick={run} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">{busy ? "Thinking…" : "Run next step"}</button>
          </div>
          {lastResult && (
            <div className={`rounded-lg p-3 text-sm ${lastResult.action === "ERROR" ? "bg-status-errBg text-status-errText" : lastResult.action === "autopilot_acted" ? "bg-accent/10 text-accent" : "bg-status-okBg text-status-okText"}`}>
              <div className="font-semibold">{lastResult.action === "autopilot_acted" ? "🤖 Autopilot acted" : lastResult.action}</div>
              <div className="text-xs">{lastResult.reason}</div>
              {lastResult.executed && Object.keys(lastResult.executed).length > 0 && (
                <ul className="text-xs mt-2 grid grid-cols-2 gap-1">
                  {Object.entries(lastResult.executed).map(([k, v]) => (
                    <li key={k} className="bg-white/50 rounded px-2 py-1">{k.replace(/_/g, " ")}: <strong className="num">{v}</strong></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="text-xs text-text-muted">
            {director.autopilotEnabled
              ? "🤖 Autopilot ON — Run next step will approve pending reviews, promote ready episodes, and publish those past their schedule."
              : "ℹ️ Autopilot OFF — Run next step only recommends. Toggle Autopilot to act automatically."}
          </div>
        </div>
      </Card>
      <Card title="Action log" subtitle={`${logs.length} entries`}>
        {logs.length === 0 ? <div className="text-text-muted text-sm">No actions yet.</div> : (
          <ul className="space-y-2 text-sm">
            {logs.slice(0, 50).map((l) => (
              <li key={l.id} className="bg-bg-main rounded-lg p-3">
                <div className="flex justify-between text-xs">
                  <span className="font-mono">{l.actorType} · {l.actionType}</span>
                  <span className="text-text-muted">{new Date(l.createdAt).toLocaleString()}</span>
                </div>
                {l.decisionReason && <div className="text-text-secondary mt-1">{l.decisionReason}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
