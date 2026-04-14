"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Log = { id: string; entityType: string; entityId: string; action: string; createdAt: string; ipAddress: string | null; actor: { fullName: string; email: string } };

export default function LogsPage() {
  const [items, setItems] = useState<Log[]>([]);
  useEffect(() => { api<Log[]>("/api/v1/audit-logs").then(setItems).catch(() => {}); }, []);

  return (
    <Card title="Audit Logs" subtitle="Recent mutations across the organization">
      {items.length === 0 ? (
        <div className="text-text-muted text-sm">No audit entries yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-widest text-text-muted">
            <tr className="border-b border-bg-main"><th className="py-2">When</th><th className="py-2">Actor</th><th className="py-2">Entity</th><th className="py-2">Action</th><th className="py-2">IP</th></tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} className="border-b border-bg-main">
                <td className="py-2 text-xs text-text-muted">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="py-2">{l.actor.fullName}</td>
                <td className="py-2"><span className="font-mono text-xs">{l.entityType} · {l.entityId.slice(0, 8)}…</span></td>
                <td className="py-2"><span className="text-xs px-2 py-0.5 rounded bg-bg-main">{l.action}</span></td>
                <td className="py-2 font-mono text-xs">{l.ipAddress ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
