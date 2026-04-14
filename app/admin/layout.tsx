"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { Topbar } from "@/components/topbar";
import { AiAssistant } from "@/components/ai-assistant";

const NAV: Array<{ href: string; label: string; section?: string }> = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users", section: "Workspace" },
  { href: "/admin/roles", label: "Roles & Permissions" },
  { href: "/admin/providers", label: "Providers & Tokens" },
  { href: "/admin/wallets", label: "Budgets & Wallets" },
  { href: "/projects", label: "Projects", section: "Content" },
  { href: "/templates", label: "Templates" },
  { href: "/admin/notifications", label: "Notifications", section: "Platform" },
  { href: "/admin/api-keys", label: "API Keys" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/logs", label: "Audit Logs" },
  { href: "/account/sessions", label: "Sessions", section: "Account" },
  { href: "/account/2fa", label: "Two-Factor Auth" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AuthGuard>
      <div className="min-h-screen flex">
        <aside className="w-[260px] shrink-0 text-sidebar-text" style={{ background: "var(--sidebar-bg-gradient)" }}>
          <Link href="/admin" className="block px-6 py-6 border-b border-white/5">
            <div className="text-xl font-bold tracking-tight text-white">VEXO <span className="text-accent-cyan">STUDIO</span></div>
            <div className="text-xs text-sidebar-muted mt-1">Admin Console</div>
          </Link>
          <nav className="py-4">
            {NAV.map((n) => {
              const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
              return (
                <div key={n.href}>
                  {n.section && <div className="px-6 pt-4 pb-1 text-[10px] uppercase tracking-widest text-sidebar-muted">{n.section}</div>}
                  <Link
                    href={n.href}
                    className={`block px-6 py-2 text-sm font-medium transition border-l-[3px] ${active ? "bg-white/5 text-white border-accent-cyan" : "border-transparent hover:bg-white/5 hover:text-white hover:border-accent-cyan"}`}
                  >
                    {n.label}
                  </Link>
                </div>
              );
            })}
          </nav>
        </aside>
        <div className="flex-1 flex flex-col">
          <Topbar title="Admin" />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </div>
        <AiAssistant />
      </div>
    </AuthGuard>
  );
}
