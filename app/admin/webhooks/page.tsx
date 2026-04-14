"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

const EVENTS = ["episode.published", "episode.failed", "job.completed", "job.failed", "scene.approved", "budget.warning"] as const;

type Endpoint = { id: string; url: string; events: string[]; isActive: boolean; createdAt: string };
type Delivery = { id: string; eventType: string; responseStatus: number | null; success: boolean; createdAt: string };

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(EVENTS));
  const [issued, setIssued] = useState<{ url: string; secret: string } | null>(null);
  const [openDel, setOpenDel] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  async function load() { setEndpoints(await api<Endpoint[]>("/api/v1/webhooks/endpoints").catch(() => [])); }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await api<{ url: string; secret: string }>("/api/v1/webhooks/endpoints", {
      method: "POST", body: { url, events: [...selected], isActive: true },
    });
    setIssued({ url: r.url, secret: r.secret });
    setUrl(""); setCreating(false);
    load();
  }

  async function deletit(id: string) {
    if (!confirm("Disable this endpoint?")) return;
    await api(`/api/v1/webhooks/endpoints/${id}`, { method: "DELETE" });
    load();
  }

  async function showDeliveries(id: string) {
    setOpenDel(id);
    setDeliveries(await api<Delivery[]>(`/api/v1/webhooks/endpoints/${id}/deliveries`).catch(() => []));
  }

  return (
    <Card title="Webhooks" subtitle="Outbound HMAC-SHA256-signed deliveries on platform events.">
      {issued && (
        <div className="bg-status-okBg border border-status-okText/30 rounded-lg p-4 mb-4">
          <div className="font-semibold text-sm mb-2">Endpoint signing secret — save it now:</div>
          <code className="block bg-white px-3 py-2 rounded font-mono text-sm break-all">{issued.secret}</code>
          <div className="text-xs text-text-muted mt-2">Verify each request with HMAC-SHA256 of the body using this secret.</div>
          <button onClick={() => setIssued(null)} className="mt-2 text-xs text-accent">Dismiss</button>
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs text-text-muted">{endpoints.length} endpoints</span>
        <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ Add endpoint</button>
      </div>
      {creating && (
        <form onSubmit={submit} className="bg-bg-main rounded-lg p-4 mb-4 space-y-3">
          <input required type="url" placeholder="https://yourapp.com/webhooks/vexo" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-bg-main bg-white" />
          <div className="grid grid-cols-3 gap-2">
            {EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-2 text-sm bg-white px-3 py-1.5 rounded-lg cursor-pointer">
                <input type="checkbox" checked={selected.has(ev)} onChange={(e) => {
                  const n = new Set(selected); e.target.checked ? n.add(ev) : n.delete(ev); setSelected(n);
                }} />
                <span className="font-mono text-xs">{ev}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-bg-main text-sm">Cancel</button>
          </div>
        </form>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-widest text-text-muted">
          <tr className="border-b border-bg-main"><th className="py-2">URL</th><th className="py-2">Events</th><th className="py-2">Active</th><th></th></tr>
        </thead>
        <tbody>
          {endpoints.map((e) => (
            <tr key={e.id} className="border-b border-bg-main">
              <td className="py-3 font-mono text-xs break-all">{e.url}</td>
              <td className="py-3 text-xs">{e.events.length} subs</td>
              <td className="py-3">{e.isActive ? "✓" : "—"}</td>
              <td className="py-3 text-right space-x-3">
                <button onClick={() => showDeliveries(e.id)} className="text-xs text-accent hover:underline">Deliveries</button>
                {e.isActive && <button onClick={() => deletit(e.id)} className="text-xs text-status-errText hover:underline">Disable</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {openDel && (
        <div className="mt-6 bg-bg-main rounded-lg p-4">
          <div className="flex justify-between mb-3">
            <div className="font-semibold text-sm">Recent deliveries</div>
            <button onClick={() => setOpenDel(null)} className="text-xs text-text-muted">Close</button>
          </div>
          {deliveries.length === 0 ? <div className="text-text-muted text-sm">No deliveries yet.</div> : (
            <table className="w-full text-xs">
              <thead><tr className="text-text-muted"><th className="text-left py-1">Event</th><th className="text-left py-1">Status</th><th className="text-left py-1">When</th></tr></thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-bg-card">
                    <td className="py-1 font-mono">{d.eventType}</td>
                    <td className={`py-1 ${d.success ? "text-status-okText" : "text-status-errText"}`}>{d.responseStatus ?? "—"} {d.success ? "✓" : "✗"}</td>
                    <td className="py-1">{new Date(d.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}
