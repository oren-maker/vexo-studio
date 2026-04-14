"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { useLang } from "@/lib/i18n";

type Summary = { profit: number; roi: number | null; splits: Array<{ entityName: string; percentage: number; payout: number }> };
type Cost = { id: string; costCategory: string; description: string | null; totalCost: number; createdAt: string; entityType?: string };
type Rev = { id: string; sourceType: string; description: string | null; amount: number; currency: string; occurredAt: string };

const CAT_LABEL_HE: Record<string, string> = {
  GENERATION: "ייצור AI",
  TOKEN: "טוקנים",
  STORAGE: "אחסון",
  SERVER: "שרתים",
  MANUAL: "ידני",
};

export default function FinancePage() {
  const { id } = useParams<{ id: string }>();
  const lang = useLang();
  const he = lang === "he";
  const [summary, setSummary] = useState<Summary | null>(null);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [revs, setRevs] = useState<Rev[]>([]);

  async function load() {
    setSummary(await api(`/api/v1/projects/${id}/finance/summary`));
    setCosts(await api(`/api/v1/projects/${id}/finance/costs`));
    setRevs(await api(`/api/v1/projects/${id}/finance/revenues`));
  }
  useEffect(() => { load(); }, [id]);

  // Aggregate by category + by entity type for the breakdown
  const byCategory = costs.reduce<Record<string, number>>((acc, c) => {
    acc[c.costCategory] = (acc[c.costCategory] ?? 0) + c.totalCost;
    return acc;
  }, {});
  const totalSpent = costs.reduce((s, c) => s + c.totalCost, 0);

  // Specifically isolate Gemini text usage (chargeUsd writes entityType=AI_TEXT for Gemini calls)
  const geminiCosts = costs.filter((c) => c.entityType === "AI_TEXT" || (c.description ?? "").toLowerCase().includes("gemini"));
  const geminiTotal = geminiCosts.reduce((s, c) => s + c.totalCost, 0);

  // Image / video generation
  const imageCosts = costs.filter((c) => c.costCategory === "GENERATION" && /image|frame|nano-banana|character/i.test(c.description ?? ""));
  const imageTotal = imageCosts.reduce((s, c) => s + c.totalCost, 0);
  const videoCosts = costs.filter((c) => c.costCategory === "GENERATION" && /video|seedance|kling/i.test(c.description ?? ""));
  const videoTotal = videoCosts.reduce((s, c) => s + c.totalCost, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{he ? "כספי הסדרה" : "Project Finance"}</h1>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-bg-card rounded-card border border-bg-main p-4">
            <div className="text-xs text-text-muted uppercase">{he ? "רווח נטו" : "Net profit"}</div>
            <div className="num text-2xl font-bold" style={{ color: summary.profit >= 0 ? "#1db868" : "#e03a4e" }}>${summary.profit.toFixed(2)}</div>
          </div>
          <div className="bg-bg-card rounded-card border border-bg-main p-4">
            <div className="text-xs text-text-muted uppercase">{he ? "סך הוצאה" : "Total spent"}</div>
            <div className="num text-2xl font-bold text-status-errText">${totalSpent.toFixed(2)}</div>
          </div>
          <div className="bg-bg-card rounded-card border border-bg-main p-4">
            <div className="text-xs text-text-muted uppercase">{he ? "ROI החזר השקעה" : "ROI"}</div>
            <div className="num text-2xl font-bold">{summary.roi != null ? `${(summary.roi * 100).toFixed(1)}%` : "—"}</div>
          </div>
          <div className="bg-bg-card rounded-card border border-bg-main p-4">
            <div className="text-xs text-text-muted uppercase">{he ? "חלוקות הכנסה" : "Splits"}</div>
            <div className="num text-2xl font-bold">{summary.splits.length}</div>
          </div>
        </div>
      )}

      {/* AI cost breakdown — text vs image vs video */}
      <Card title={he ? "פירוט עלויות AI" : "AI cost breakdown"} subtitle={he ? "כל פעולה בסדרה — עלות מדויקת" : "Every operation — exact cost"}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-bg-main rounded-lg p-3">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{he ? "🤖 Gemini טקסט" : "🤖 Gemini text"}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">{he ? "בתשלום · fal" : "paid · fal"}</span>
            </div>
            <div className="font-bold num text-lg mt-1">${geminiTotal.toFixed(4)}</div>
            <div className="text-[10px] text-text-muted">{geminiCosts.length} {he ? "קריאות" : "calls"}</div>
          </div>
          <div className="bg-bg-main rounded-lg p-3">
            <div className="text-xs text-text-muted">{he ? "🖼 תמונות (nano-banana)" : "🖼 Images (nano-banana)"}</div>
            <div className="font-bold num text-lg mt-1">${imageTotal.toFixed(4)}</div>
            <div className="text-[10px] text-text-muted">{imageCosts.length} {he ? "תמונות" : "images"}</div>
          </div>
          <div className="bg-bg-main rounded-lg p-3">
            <div className="text-xs text-text-muted">{he ? "🎬 וידאו" : "🎬 Video"}</div>
            <div className="font-bold num text-lg mt-1">${videoTotal.toFixed(4)}</div>
            <div className="text-[10px] text-text-muted">{videoCosts.length} {he ? "סרטונים" : "clips"}</div>
          </div>
        </div>
        {Object.keys(byCategory).length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(byCategory).map(([cat, v]) => (
              <span key={cat} className="px-2 py-1 rounded-full bg-bg-main">{he ? (CAT_LABEL_HE[cat] ?? cat) : cat}: <span className="num font-semibold">${v.toFixed(4)}</span></span>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={he ? "הוצאות" : "Costs"} subtitle={`${costs.length} ${he ? "פעולות" : "entries"} · $${totalSpent.toFixed(4)}`}>
          {costs.length === 0 ? <div className="text-text-muted text-sm">{he ? "אין הוצאות עדיין" : "No costs yet."}</div> : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-text-muted tracking-widest">
                <tr>
                  <th className="text-start py-2">{he ? "קטגוריה" : "Category"}</th>
                  <th className="text-start py-2">{he ? "תיאור" : "Description"}</th>
                  <th className="text-end py-2">{he ? "סכום" : "Amount"}</th>
                </tr>
              </thead>
              <tbody>{costs.map((c) => (
                <tr key={c.id} className="border-t border-bg-main">
                  <td className="py-2 text-xs"><span className="px-2 py-0.5 rounded bg-bg-main">{he ? (CAT_LABEL_HE[c.costCategory] ?? c.costCategory) : c.costCategory}</span></td>
                  <td className="py-2 text-text-secondary">{c.description ?? "—"}</td>
                  <td className="py-2 text-end num text-status-errText">${c.totalCost.toFixed(4)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title={he ? "הכנסות" : "Revenue"} subtitle={`${revs.length} ${he ? "פריטים" : "entries"}`}>
          {revs.length === 0 ? <div className="text-text-muted text-sm">{he ? "אין הכנסות עדיין" : "No revenue yet."}</div> : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-text-muted tracking-widest">
                <tr>
                  <th className="text-start py-2">{he ? "מקור" : "Source"}</th>
                  <th className="text-start py-2">{he ? "תיאור" : "Description"}</th>
                  <th className="text-end py-2">{he ? "סכום" : "Amount"}</th>
                </tr>
              </thead>
              <tbody>{revs.map((r) => (
                <tr key={r.id} className="border-t border-bg-main">
                  <td className="py-2 text-xs"><span className="px-2 py-0.5 rounded bg-bg-main">{r.sourceType}</span></td>
                  <td className="py-2 text-text-secondary">{r.description ?? "—"}</td>
                  <td className="py-2 text-end num text-status-okText">${r.amount.toFixed(2)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      </div>

      {summary && summary.splits.length > 0 && (
        <Card title={he ? "חלוקת הכנסות" : "Revenue splits"}>
          <ul className="space-y-2">
            {summary.splits.map((s) => (
              <li key={s.entityName} className="flex justify-between text-sm">
                <span>{s.entityName}</span>
                <span className="num"><span className="text-text-muted me-3">{s.percentage}%</span><span className="font-bold">${s.payout.toFixed(2)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
