"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { useLang } from "@/lib/i18n";

type Check = { id: string; name: string; path: string; ok: boolean; latencyMs: number; error?: string; response?: string };
type Result = { totalChecks: number; passed: number; failed: number; avgLatencyMs: number; provider: string; checks: Check[] };

export default function AiHealthPage() {
  const lang = useLang();
  const he = lang === "he";
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setRes(null);
    try { setRes(await api<Result>("/api/v1/admin/ai-health")); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const [backfillBusy, setBackfillBusy] = useState(false);
  async function backfillSheets() {
    if (!confirm(he ? "לייצר דף במאי לכל הסצנות בארגון שעדיין אין להן? (כל סצנה עולה ~$0.001 ב-Gemini)" : "Generate Director Sheet for every scene missing one? (~\$0.001 per scene)")) return;
    setBackfillBusy(true);
    try {
      let pending = Infinity, total = 0;
      while (pending !== 0) {
        const r = await api<{ succeeded: number; pending: number }>("/api/v1/admin/backfill-sheets", { method: "POST" });
        total += r.succeeded;
        pending = r.pending;
        if (r.succeeded === 0 && r.pending === 0) break;
      }
      alert((he ? "הושלם. נוצרו דפי במאי ל-" : "Done. Generated sheets for ") + total + (he ? " סצנות." : " scenes."));
    } catch (e) { alert((e as Error).message); }
    finally { setBackfillBusy(false); }
  }

  return (
    <Card title={he ? "בדיקת תקינות AI" : "AI health check"} subtitle={he ? "בודק שכל האשפים עונים דרך הספק הנוכחי" : "Verifies every wizard calls through the current provider"}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-text-muted">
          {res && (
            <span>
              {he ? "ספק: " : "Provider: "}<span className="font-semibold text-text-primary">{res.provider}</span>
              {" · "}{he ? "עברו: " : "Passed: "}<span className={res.failed === 0 ? "text-status-okText font-bold" : "text-status-errText font-bold"}>{res.passed}/{res.totalChecks}</span>
              {" · "}{he ? "ממוצע השהיה: " : "Avg latency: "}<span className="num">{res.avgLatencyMs}ms</span>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button disabled={backfillBusy} onClick={backfillSheets} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50">
            {backfillBusy ? (he ? "ממלא…" : "Filling…") : (he ? "📋 דפי במאי לכל הסצנות" : "📋 Director Sheets for all scenes")}
          </button>
          <button disabled={busy} onClick={run} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {busy ? (he ? "בודק…" : "Running…") : (he ? "▶ הפעל בדיקה" : "▶ Run check")}
          </button>
        </div>
      </div>

      {err && <div className="text-status-errText text-sm mb-3">{err}</div>}

      {!res && !busy && (
        <div className="text-text-muted text-sm text-center py-12">
          <div className="text-3xl mb-2">🩺</div>
          {he ? "לחץ \"הפעל בדיקה\" — ~15 שניות" : "Click Run check — ~15s"}
        </div>
      )}

      {res && (
        <ul className="space-y-2">
          {res.checks.map((c) => (
            <li key={c.id} className={`rounded-lg p-3 border ${c.ok ? "bg-status-okBg border-status-okText/30" : "bg-status-errBg border-status-errText/40"}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <span>{c.ok ? "✅" : "❌"}</span>
                    <span>{c.name}</span>
                    <span className="text-[11px] text-text-muted font-mono">{c.path}</span>
                  </div>
                  {c.response && <div className="text-[11px] text-text-secondary mt-1 truncate">{c.response}</div>}
                  {c.error && <div className="text-[11px] text-status-errText mt-1">⚠ {c.error}</div>}
                </div>
                <div className="text-xs num text-text-muted shrink-0">{c.latencyMs}ms</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
