"use client";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { Topbar } from "@/components/topbar";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen flex">
        <aside className="w-[260px] shrink-0 text-sidebar-text" style={{ background: "var(--sidebar-bg-gradient)" }}>
          <Link href="/admin" className="block px-6 py-6 border-b border-white/5">
            <div className="text-xl font-bold tracking-tight text-white">VEXO <span className="text-accent-cyan">STUDIO</span></div>
          </Link>
          <nav className="py-4">
            <Link href="/admin" className="block px-6 py-2 text-sm font-medium hover:bg-white/5 hover:text-white border-l-[3px] border-transparent">← Back to Admin</Link>
            <Link href="/projects" className="block px-6 py-2 text-sm font-medium hover:bg-white/5 hover:text-white border-l-[3px] border-accent-cyan bg-white/5 text-white">Projects</Link>
            <Link href="/projects/new" className="block px-6 py-2 text-sm hover:bg-white/5 hover:text-white border-l-[3px] border-transparent">+ New project</Link>
            <Link href="/templates" className="block px-6 py-2 text-sm hover:bg-white/5 hover:text-white border-l-[3px] border-transparent">Templates</Link>
          </nav>
        </aside>
        <div className="flex-1 flex flex-col">
          <Topbar title="Projects" />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
