"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Summary = { profit: number; roi: number | null; splits: Array<{ entityName: string; percentage: number; payout: number }> };
type Cost = { id: string; costCategory: string; description: string | null; totalCost: number; createdAt: string };
type Rev = { id: string; sourceType: string; description: string | null; amount: number; currency: string; occurredAt: string };

export default function FinancePage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [revs, setRevs] = useState<Rev[]>([]);

  async function load() {
    setSummary(await api(`/api/v1/projects/${id}/finance/summary`));
    setCosts(await api(`/api/v1/projects/${id}/finance/costs`));
    setRevs(await api(`/api/v1/projects/${id}/finance/revenues`));
  }
  useEffect(() => { load(); }, [id]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Project Finance</h1>
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">Net profit</div><div className="num text-2xl font-bold" style={{ color: summary.profit >= 0 ? "#1db868" : "#e03a4e" }}>${summary.profit.toFixed(2)}</div></div>
          <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">ROI</div><div className="num text-2xl font-bold">{summary.roi != null ? `${(summary.roi * 100).toFixed(1)}%` : "—"}</div></div>
          <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">Splits</div><div className="num text-2xl font-bold">{summary.splits.length}</div></div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Costs" subtitle={`${costs.length} entries`}>
          {costs.length === 0 ? <div className="text-text-muted text-sm">No costs yet.</div> : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-text-muted tracking-widest"><tr><th className="text-left py-2">Category</th><th className="text-left py-2">Description</th><th className="text-right py-2">Amount</th></tr></thead>
              <tbody>{costs.map((c) => (
                <tr key={c.id} className="border-t border-bg-main">
                  <td className="py-2 text-xs"><span className="px-2 py-0.5 rounded bg-bg-main">{c.costCategory}</span></td>
                  <td className="py-2 text-text-secondary">{c.description ?? "—"}</td>
                  <td className="py-2 text-right num text-status-errText">${c.totalCost.toFixed(2)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title="Revenue" subtitle={`${revs.length} entries`}>
          {revs.length === 0 ? <div className="text-text-muted text-sm">No revenue yet.</div> : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-text-muted tracking-widest"><tr><th className="text-left py-2">Source</th><th className="text-left py-2">Description</th><th className="text-right py-2">Amount</th></tr></thead>
              <tbody>{revs.map((r) => (
                <tr key={r.id} className="border-t border-bg-main">
                  <td className="py-2 text-xs"><span className="px-2 py-0.5 rounded bg-bg-main">{r.sourceType}</span></td>
                  <td className="py-2 text-text-secondary">{r.description ?? "—"}</td>
                  <td className="py-2 text-right num text-status-okText">${r.amount.toFixed(2)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      </div>
      {summary && summary.splits.length > 0 && (
        <Card title="Revenue splits">
          <ul className="space-y-2">
            {summary.splits.map((s) => (
              <li key={s.entityName} className="flex justify-between text-sm">
                <span>{s.entityName}</span>
                <span className="num"><span className="text-text-muted mr-3">{s.percentage}%</span><span className="font-bold">${s.payout.toFixed(2)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
