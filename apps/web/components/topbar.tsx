"use client";
import { useRouter } from "next/navigation";
import { useMe } from "./auth-guard";
import { NotificationBell } from "./notification-bell";
import { api, setAccessToken } from "@/lib/api";

export function Topbar({ title }: { title: string }) {
  const router = useRouter();
  const { me } = useMe();

  async function signOut() {
    try { await api("/api/v1/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    setAccessToken(null);
    router.push("/login");
  }

  const initials = (me?.user?.fullName ?? "??").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const orgName = me?.user?.organizations?.[0]?.organization?.name;

  return (
    <header className="h-16 bg-bg-topbar border-b border-bg-main flex items-center justify-between px-6">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {orgName && <div className="text-xs text-text-muted">{orgName}</div>}
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="group relative">
          <div className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center text-sm font-semibold cursor-pointer">{initials}</div>
          <div className="absolute right-0 mt-2 w-56 bg-bg-card rounded-card shadow-card border border-bg-main z-10 hidden group-hover:block">
            <div className="px-4 py-3 border-b border-bg-main">
              <div className="font-semibold text-sm truncate">{me?.user?.fullName}</div>
              <div className="text-xs text-text-muted truncate">{me?.user?.email}</div>
            </div>
            <button onClick={() => router.push("/account/2fa")} className="block w-full text-left px-4 py-2 hover:bg-bg-main text-sm">Two-factor auth</button>
            <button onClick={() => router.push("/account/sessions")} className="block w-full text-left px-4 py-2 hover:bg-bg-main text-sm">Sessions</button>
            <button onClick={signOut} className="block w-full text-left px-4 py-2 hover:bg-bg-main text-sm text-status-errText border-t border-bg-main">Sign out</button>
          </div>
        </div>
      </div>
    </header>
  );
}
