"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Provider = {
  id: string; name: string; category: string; apiUrl?: string; isActive: boolean;
  wallet?: { availableCredits: number; totalCreditsAdded: number };
};

const CATS = ["VIDEO", "IMAGE", "AUDIO", "DUBBING", "MUSIC", "SUBTITLE", "DISTRIBUTION"] as const;

export default function ProvidersPage() {
  const [items, setItems] = useState<Provider[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", category: "VIDEO", apiUrl: "", apiKey: "" });
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setItems(await api<Provider[]>("/api/v1/providers")); } catch (e: unknown) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api("/api/v1/providers", { method: "POST", body: { ...form, isActive: true } });
      setForm({ name: "", category: "VIDEO", apiUrl: "", apiKey: "" });
      setCreating(false);
      load();
    } catch (e: unknown) { setErr((e as Error).message); }
  }

  async function test(id: string) {
    try { const r = await api<{ ok: boolean }>(`/api/v1/providers/${id}/test`, { method: "POST" }); alert(JSON.stringify(r)); } catch (e: unknown) { alert((e as Error).message); }
  }

  return (
    <Card title="Providers & Tokens" subtitle="AI service connections (encrypted at rest with AES-256-GCM)">
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs text-text-muted">{items.length} providers</span>
        <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ Add provider</button>
      </div>
      {err && <div className="text-status-errText text-sm mb-3">{err}</div>}
      {creating && (
        <form onSubmit={submit} className="bg-bg-main rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="px-3 py-2 rounded-lg border border-bg-main bg-white">
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input placeholder="API URL (optional)" value={form.apiUrl} onChange={(e) => setForm({ ...form, apiUrl: e.target.value })} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <input placeholder="API key (encrypted)" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-bg-main text-sm">Cancel</button>
          </div>
        </form>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-widest text-text-muted">
          <tr className="border-b border-bg-main">
            <th className="py-2">Name</th><th className="py-2">Category</th><th className="py-2">URL</th>
            <th className="py-2">Available credits</th><th className="py-2">Active</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b border-bg-main">
              <td className="py-3 font-medium">{p.name}</td>
              <td className="py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-bg-main">{p.category}</span></td>
              <td className="py-3 text-text-secondary text-xs">{p.apiUrl ?? "—"}</td>
              <td className="py-3 num">{p.wallet?.availableCredits?.toFixed(2) ?? "—"}</td>
              <td className="py-3">{p.isActive ? "✓" : "—"}</td>
              <td className="py-3 text-right"><button onClick={() => test(p.id)} className="text-xs text-accent hover:underline">Test</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
