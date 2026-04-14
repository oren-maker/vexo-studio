"use client";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { Topbar } from "@/components/topbar";

export default function ScenesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen flex">
        <aside className="w-[260px] shrink-0 text-sidebar-text" style={{ background: "var(--sidebar-bg-gradient)" }}>
          <Link href="/admin" className="block px-6 py-6 border-b border-white/5">
            <div className="text-xl font-bold tracking-tight text-white">VEXO <span className="text-accent-cyan">STUDIO</span></div>
          </Link>
        </aside>
        <div className="flex-1 flex flex-col">
          <Topbar title="Scene" />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
