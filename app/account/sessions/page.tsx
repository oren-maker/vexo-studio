"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Session = { id: string; deviceName: string | null; ipAddress: string | null; userAgent: string | null; createdAt: string; expiresAt: string };

export default function SessionsPage() {
  const [items, setItems] = useState<Session[]>([]);

  async function load() { setItems(await api<Session[]>("/api/v1/auth/sessions").catch(() => [])); }
  useEffect(() => { load(); }, []);

  async function revoke(id: string) {
    if (!confirm("Revoke this session?")) return;
    await api(`/api/v1/auth/sessions/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <Card title="Active Sessions" subtitle="Devices currently signed in to your account.">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-widest text-text-muted">
          <tr className="border-b border-bg-main">
            <th className="py-2">Device / User-Agent</th><th className="py-2">IP</th><th className="py-2">Created</th><th className="py-2">Expires</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-b border-bg-main">
              <td className="py-3 max-w-[300px] truncate">{s.deviceName ?? s.userAgent ?? "Unknown"}</td>
              <td className="py-3 font-mono text-xs">{s.ipAddress ?? "—"}</td>
              <td className="py-3 text-xs text-text-muted">{new Date(s.createdAt).toLocaleString()}</td>
              <td className="py-3 text-xs text-text-muted">{new Date(s.expiresAt).toLocaleDateString()}</td>
              <td className="py-3 text-right"><button onClick={() => revoke(s.id)} className="text-xs text-status-errText hover:underline">Revoke</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
