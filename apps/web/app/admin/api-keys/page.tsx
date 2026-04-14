"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

const SCOPES = [
  "projects:read", "projects:write",
  "episodes:read", "episodes:write",
  "scenes:read", "scenes:write",
  "generate:assets", "publish:episodes", "analytics:read",
] as const;

type Key = { id: string; name: string; keyPrefix: string; scopes: string[]; lastUsedAt: string | null; expiresAt: string | null; isActive: boolean; createdAt: string };

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["projects:read"]));
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null);

  async function load() { setKeys(await api<Key[]>("/api/v1/api-keys").catch(() => [])); }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await api<{ name: string; key: string }>("/api/v1/api-keys", {
      method: "POST",
      body: { name, scopes: [...selected] },
    });
    setIssued(r);
    setName(""); setSelected(new Set(["projects:read"])); setCreating(false);
    load();
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key?")) return;
    await api(`/api/v1/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <Card title="API Keys" subtitle="Programmatic access. Keys are shown only once on creation.">
      {issued && (
        <div className="bg-status-okBg border border-status-okText/30 rounded-lg p-4 mb-4">
          <div className="font-semibold text-sm mb-2">New key for "{issued.name}" — copy now, you won't see it again:</div>
          <code className="block bg-white px-3 py-2 rounded font-mono text-sm break-all">{issued.key}</code>
          <button onClick={() => setIssued(null)} className="mt-2 text-xs text-accent">Dismiss</button>
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs text-text-muted">{keys.length} keys</span>
        <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ Create key</button>
      </div>
      {creating && (
        <form onSubmit={submit} className="bg-bg-main rounded-lg p-4 mb-4 space-y-3">
          <input required placeholder="Key name (e.g. CI pipeline)" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-bg-main bg-white" />
          <div>
            <div className="text-xs uppercase tracking-widest text-text-muted mb-2">Scopes</div>
            <div className="grid grid-cols-3 gap-2">
              {SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm bg-white px-3 py-1.5 rounded-lg cursor-pointer">
                  <input type="checkbox" checked={selected.has(s)} onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(s); else next.delete(s);
                    setSelected(next);
                  }} />
                  <span className="font-mono text-xs">{s}</span>
                </label>
              ))}
            </div>
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
            <th className="py-2">Name</th><th className="py-2">Prefix</th><th className="py-2">Scopes</th>
            <th className="py-2">Last used</th><th className="py-2">Created</th><th></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className={`border-b border-bg-main ${!k.isActive ? "opacity-50" : ""}`}>
              <td className="py-3 font-medium">{k.name}</td>
              <td className="py-3 font-mono text-xs">{k.keyPrefix}…</td>
              <td className="py-3 text-xs text-text-secondary">{k.scopes.length} scopes</td>
              <td className="py-3 text-xs text-text-muted">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}</td>
              <td className="py-3 text-xs text-text-muted">{new Date(k.createdAt).toLocaleDateString()}</td>
              <td className="py-3 text-right">{k.isActive && <button onClick={() => revoke(k.id)} className="text-xs text-status-errText hover:underline">Revoke</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
