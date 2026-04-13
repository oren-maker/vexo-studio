import Link from "next/link";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/roles", label: "Roles & Permissions" },
  { href: "/admin/providers", label: "Providers & Tokens" },
  { href: "/admin/wallets", label: "Budgets & Wallets" },
  { href: "/projects", label: "Projects" },
  { href: "/admin/logs", label: "Audit Logs" },
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
        </div>
        <nav className="py-4">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="block px-6 py-2.5 text-sm font-medium hover:bg-white/5 hover:text-white transition border-l-[3px] border-transparent hover:border-accent-cyan"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="h-16 bg-bg-topbar border-b border-bg-main flex items-center px-6">
          <h1 className="text-lg font-semibold">Admin</h1>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
