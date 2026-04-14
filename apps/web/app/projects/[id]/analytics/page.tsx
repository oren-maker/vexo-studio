"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Stats = { profit: number; roi: number | null; revenue: number; cost: number };
type Insight = { id: string; insightType: string; content: object; recommendation: string | null; generatedAt: string };

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    api<Stats>(`/api/v1/projects/${id}/analytics`).then(setStats).catch(() => {});
    api<Insight[]>(`/api/v1/projects/${id}/audience-insights`).then(setInsights).catch(() => {});
  }, [id]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">Cost</div><div className="num text-2xl font-bold" style={{ color: "#e03a4e" }}>${stats.cost.toFixed(2)}</div></div>
          <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">Revenue</div><div className="num text-2xl font-bold" style={{ color: "#1db868" }}>${stats.revenue.toFixed(2)}</div></div>
          <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">Profit</div><div className="num text-2xl font-bold" style={{ color: "#0091d4" }}>${stats.profit.toFixed(2)}</div></div>
          <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">ROI</div><div className="num text-2xl font-bold">{stats.roi != null ? `${(stats.roi * 100).toFixed(1)}%` : "—"}</div></div>
        </div>
      )}
      <Card title="Audience insights" subtitle={`${insights.length} insights generated`}>
        {insights.length === 0 ? (
          <div className="text-text-muted text-sm">No insights yet. Run analysis on a published episode to get started.</div>
        ) : (
          <ul className="space-y-3">
            {insights.map((i) => (
              <li key={i.id} className="bg-bg-main rounded-lg p-3">
                <div className="flex justify-between text-xs text-text-muted mb-1"><span className="font-mono">{i.insightType}</span><span>{new Date(i.generatedAt).toLocaleString()}</span></div>
                <pre className="text-xs overflow-x-auto">{JSON.stringify(i.content, null, 2)}</pre>
                {i.recommendation && <div className="text-sm mt-2 italic">{i.recommendation}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
