"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Topbar } from "@/components/topbar";
import { AiAssistant } from "@/components/ai-assistant";
import { RtlEffect } from "@/components/rtl-effect";
import { AutoT } from "@/components/translator";
import { useT, useLang } from "@/lib/i18n";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  const lang = useLang();

  // Top-level items
  const TOP: Array<{ href: string; label: string }> = [
    { href: "/admin", label: t("nav.dashboard") },
    { href: "/projects", label: t("nav.projects") },
    { href: "/admin/wallets", label: lang === "he" ? "תקציבים וטוקנים" : "Budgets & Tokens" },
  ];

  // Collapsible "Admin Settings" group
  const SETTINGS: Array<{ href: string; label: string }> = [
    { href: "/admin/roles", label: t("nav.roles") },
    { href: "/admin/users", label: t("nav.users") },
    { href: "/admin/notifications", label: t("nav.notifications") },
    { href: "/admin/api-keys", label: t("nav.api.keys") },
    { href: "/admin/webhooks", label: t("nav.webhooks") },
    { href: "/admin/logs", label: t("nav.audit.logs") },
  ];

  const inSettings = SETTINGS.some((n) => pathname.startsWith(n.href));
  const [settingsOpen, setSettingsOpen] = useState<boolean>(inSettings);

  return (
    <AuthGuard>
      <RtlEffect />
      <div className="min-h-screen flex">
        <aside className="w-[260px] shrink-0 text-sidebar-text" style={{ background: "var(--sidebar-bg-gradient)" }}>
          <Link href="/admin" className="block px-6 py-6 border-b border-white/5">
            <div className="text-xl font-bold tracking-tight text-white">VEXO <span className="text-accent-cyan">STUDIO</span></div>
            <div className="text-xs text-sidebar-muted mt-1">{t("admin.console")}</div>
          </Link>

          <nav className="py-4">
            {TOP.map((n) => {
              const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`block px-6 py-2 text-sm font-medium transition border-s-[3px] ${active ? "bg-white/5 text-white border-accent-cyan" : "border-transparent hover:bg-white/5 hover:text-white hover:border-accent-cyan"}`}
                >
                  {n.label}
                </Link>
              );
            })}

            {/* Collapsible Admin Settings group */}
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className={`w-full flex items-center justify-between px-6 py-2 mt-2 text-sm font-medium border-s-[3px] border-transparent transition ${inSettings ? "bg-white/5 text-white border-accent-cyan" : "hover:bg-white/5 hover:text-white"}`}
            >
              <span>{lang === "he" ? "הגדרות ניהול" : "Admin Settings"}</span>
              <span className="text-xs">{settingsOpen ? "▾" : "▸"}</span>
            </button>
            {settingsOpen && (
              <div className="bg-white/[0.02] py-1">
                {SETTINGS.map((n) => {
                  const active = pathname.startsWith(n.href);
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={`block ps-10 pe-6 py-1.5 text-sm transition border-s-[3px] ${active ? "text-white border-accent-cyan" : "text-sidebar-text/80 border-transparent hover:text-white hover:bg-white/5 hover:border-accent-cyan"}`}
                    >
                      {n.label}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Account stays separate at the bottom */}
            <div className="px-6 pt-4 pb-1 text-[10px] uppercase tracking-widest text-sidebar-muted">{t("section.account")}</div>
            <Link href="/account/sessions" className={`block px-6 py-2 text-sm font-medium transition border-s-[3px] ${pathname.startsWith("/account/sessions") ? "bg-white/5 text-white border-accent-cyan" : "border-transparent hover:bg-white/5 hover:text-white hover:border-accent-cyan"}`}>{t("nav.sessions")}</Link>
            <Link href="/account/2fa" className={`block px-6 py-2 text-sm font-medium transition border-s-[3px] ${pathname.startsWith("/account/2fa") ? "bg-white/5 text-white border-accent-cyan" : "border-transparent hover:bg-white/5 hover:text-white hover:border-accent-cyan"}`}>{t("nav.2fa")}</Link>
          </nav>
        </aside>

        <div className="flex-1 flex flex-col">
          <Topbar title={t("admin")} />
          <main className="flex-1 p-6 overflow-y-auto"><AutoT>{children}</AutoT></main>
        </div>
        <AiAssistant />
      </div>
    </AuthGuard>
  );
}
