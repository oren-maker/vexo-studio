import Link from "next/link";

const NAV: Array<{ href: string; label: string; section?: string }> = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users", section: "Workspace" },
  { href: "/admin/roles", label: "Roles & Permissions" },
  { href: "/admin/providers", label: "Providers & Tokens" },
  { href: "/admin/wallets", label: "Budgets & Wallets" },
  { href: "/projects", label: "Projects", section: "Content" },
  { href: "/projects/calendar", label: "Content Calendar" },
  { href: "/templates", label: "Templates" },
  { href: "/admin/notifications", label: "Notifications", section: "Platform" },
  { href: "/admin/api-keys", label: "API Keys" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/logs", label: "Audit Logs" },
  { href: "/account/sessions", label: "Sessions", section: "Account" },
  { href: "/account/2fa", label: "Two-Factor Auth" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside
        className="w-[260px] shrink-0 text-sidebar-text"
        style={{ background: "var(--sidebar-bg-gradient)" }}
      >
        <div className="px-6 py-6 border-b border-white/5">
          <div className="text-xl font-bold tracking-tight text-white">
            VEXO <span className="text-accent-cyan">STUDIO</span>
          </div>
          <div className="text-xs text-sidebar-muted mt-1">Admin Console</div>
        </div>
        <nav className="py-4">
          {NAV.map((n) => (
            <div key={n.href}>
              {n.section && (
                <div className="px-6 pt-4 pb-1 text-[10px] uppercase tracking-widest text-sidebar-muted">
                  {n.section}
                </div>
              )}
              <Link
                href={n.href}
                className="block px-6 py-2 text-sm font-medium hover:bg-white/5 hover:text-white transition border-l-[3px] border-transparent hover:border-accent-cyan"
              >
                {n.label}
              </Link>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="h-16 bg-bg-topbar border-b border-bg-main flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold">Admin</h1>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-lg hover:bg-bg-main flex items-center justify-center" aria-label="Notifications">
              <span aria-hidden>🔔</span>
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-status-errText text-white text-[10px] font-bold flex items-center justify-center">
                0
              </span>
            </button>
            <div className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center text-sm font-semibold">SA</div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
