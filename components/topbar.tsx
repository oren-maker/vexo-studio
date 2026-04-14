"use client";
import { useRouter } from "next/navigation";
import { useMe } from "./auth-guard";
import { NotificationBell } from "./notification-bell";
import { api, setAccessToken } from "@/lib/api";
import { useT, useLang } from "@/lib/i18n";

export function Topbar({ title }: { title: string }) {
  const router = useRouter();
  const { me } = useMe();
  const t = useT();
  const lang = useLang();

  async function signOut() {
    try { await api("/api/v1/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    setAccessToken(null);
    router.push("/login");
  }

  async function setLanguage(newLang: "en" | "he") {
    try {
      await api(`/api/v1/auth/me`, { method: "PATCH", body: { language: newLang } });
      window.location.reload();
    } catch (e) { alert((e as Error).message); }
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
          <div className="absolute end-0 mt-2 w-64 bg-bg-card rounded-card shadow-card border border-bg-main z-10 hidden group-hover:block">
            <div className="px-4 py-3 border-b border-bg-main">
              <div className="font-semibold text-sm truncate">{me?.user?.fullName}</div>
              <div className="text-xs text-text-muted truncate">{me?.user?.email}</div>
            </div>
            <div className="px-4 py-2 border-b border-bg-main">
              <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">{t("language")}</div>
              <div className="flex gap-1">
                <button onClick={() => setLanguage("en")} className={`flex-1 px-2 py-1 rounded text-xs ${lang === "en" ? "bg-accent text-white" : "bg-bg-main"}`}>EN</button>
                <button onClick={() => setLanguage("he")} className={`flex-1 px-2 py-1 rounded text-xs ${lang === "he" ? "bg-accent text-white" : "bg-bg-main"}`}>עברית</button>
              </div>
            </div>
            <button onClick={() => router.push("/account/2fa")} className="block w-full text-start px-4 py-2 hover:bg-bg-main text-sm">{t("two.factor")}</button>
            <button onClick={() => router.push("/account/sessions")} className="block w-full text-start px-4 py-2 hover:bg-bg-main text-sm">{t("sessions")}</button>
            <button onClick={signOut} className="block w-full text-start px-4 py-2 hover:bg-bg-main text-sm text-status-errText border-t border-bg-main">{t("sign.out")}</button>
          </div>
        </div>
      </div>
    </header>
  );
}
