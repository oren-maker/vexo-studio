"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type N = { id: string; type: string; title: string; body: string; isRead: boolean; createdAt: string; entityType: string | null; entityId: string | null };

export default function NotificationsPage() {
  const [items, setItems] = useState<N[]>([]);

  async function load() { setItems(await api<N[]>("/api/v1/notifications").catch(() => [])); }
  useEffect(() => { load(); const i = setInterval(load, 10_000); return () => clearInterval(i); }, []);

  async function markAll() { await api("/api/v1/notifications/read-all", { method: "PATCH" }); load(); }

  return (
    <Card title="Notifications" subtitle="In-app activity from your organization.">
      <div className="flex justify-between mb-4">
        <span className="text-xs text-text-muted">{items.filter((i) => !i.isRead).length} unread</span>
        <button onClick={markAll} className="text-sm text-accent hover:underline">Mark all as read</button>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <div className="text-3xl mb-2">🔔</div>
          <div>You're all caught up.</div>
        </div>
      ) : (
        <ul className="divide-y divide-bg-main">
          {items.map((n) => (
            <li key={n.id} className={`py-3 flex gap-3 ${n.isRead ? "" : "bg-accent/5 px-3 -mx-3 rounded"}`}>
              <span className="text-xl shrink-0">{n.type === "JOB_FAILED" ? "❌" : n.type === "JOB_DONE" ? "✅" : n.type === "PUBLISH_SUCCESS" ? "🚀" : "📢"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{n.title}</div>
                <div className="text-sm text-text-secondary">{n.body}</div>
                <div className="text-[11px] text-text-muted mt-1">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
