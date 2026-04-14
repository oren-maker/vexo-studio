"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Variant = { id: string; label: string; isActive: boolean; isWinner: boolean; impressions: number; clickRate: number | null };

export default function ThumbnailsPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<Variant[]>([]);

  async function load() { setItems(await api<Variant[]>(`/api/v1/episodes/${id}/thumbnails`).catch(() => [])); }
  useEffect(() => { load(); }, [id]);

  async function activate(vid: string) { await api(`/api/v1/thumbnails/${vid}/activate`, { method: "POST" }); load(); }
  async function winner(vid: string) { await api(`/api/v1/thumbnails/${vid}/winner`, { method: "POST" }); load(); }

  return (
    <Card title="A/B Thumbnails" subtitle="Test multiple variants, pick the winner">
      {items.length === 0 ? (
        <div className="text-center py-12 text-text-muted"><div className="text-3xl mb-2">🖼️</div><div>No variants yet — upload an asset, then add a variant.</div></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {items.map((v) => (
            <div key={v.id} className={`bg-bg-main rounded-card p-4 border-2 ${v.isWinner ? "border-status-okText" : v.isActive ? "border-accent" : "border-transparent"}`}>
              <div className="aspect-video bg-bg-card rounded grid place-items-center mb-3 text-text-muted">🖼️</div>
              <div className="font-semibold mb-1">{v.label}</div>
              <div className="text-xs text-text-muted mb-3">{v.impressions.toLocaleString()} impressions{v.clickRate != null && ` · CTR ${(v.clickRate * 100).toFixed(2)}%`}</div>
              <div className="flex gap-2 text-xs">
                {!v.isActive && <button onClick={() => activate(v.id)} className="px-2 py-1 rounded bg-accent text-white">Activate</button>}
                {v.isActive && <span className="px-2 py-1 rounded bg-accent text-white">Active</span>}
                {!v.isWinner && <button onClick={() => winner(v.id)} className="px-2 py-1 rounded border border-bg-card">Mark winner</button>}
                {v.isWinner && <span className="px-2 py-1 rounded bg-status-okText text-white">🏆 Winner</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
