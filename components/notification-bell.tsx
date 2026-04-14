"use client";
import { useEffect, useState } from "react";
import { api, getAccessToken } from "@/lib/api";

type Notification = {
  id: string; type: string; title: string; body: string;
  isRead: boolean; createdAt: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const unread = items.filter((i) => !i.isRead).length;

  async function load() {
    try {
      const data = await api<Notification[]>("/api/v1/notifications");
      setItems(data);
    } catch { /* ignore */ }
  }

  async function markAll() {
    await api("/api/v1/notifications/read-all", { method: "PATCH" });
    setItems((cur) => cur.map((i) => ({ ...i, isRead: true })));
  }

  useEffect(() => {
    load();
    // SSE — fetch with auth header (EventSource doesn't support custom headers, so we poll)
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative w-9 h-9 rounded-lg hover:bg-bg-main flex items-center justify-center" aria-label="Notifications">
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-status-errText text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[360px] bg-bg-card rounded-card shadow-card border border-bg-main z-10">
          <div className="flex items-center justify-between px-4 py-3 border-b border-bg-main">
            <span className="font-semibold text-sm">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-accent hover:underline">Mark all as read</button>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-muted">No notifications yet</div>
            ) : items.slice(0, 20).map((n) => (
              <div key={n.id} className={`px-4 py-3 border-b border-bg-main last:border-0 ${n.isRead ? "" : "bg-accent/5"}`}>
                <div className="flex items-start gap-2">
                  <span className="text-lg" aria-hidden>{n.type === "JOB_FAILED" ? "❌" : n.type === "JOB_DONE" ? "✅" : "📢"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{n.title}</div>
                    <div className="text-xs text-text-secondary truncate">{n.body}</div>
                    <div className="text-[10px] text-text-muted mt-1">{new Date(n.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
