"use client";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { Topbar } from "@/components/topbar";
import { AiAssistant } from "@/components/ai-assistant";
import { RtlEffect } from "@/components/rtl-effect";
import { AutoT } from "@/components/translator";

export default function EpisodesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RtlEffect />
      <div className="min-h-screen flex">
        <aside className="w-[260px] shrink-0 text-sidebar-text" style={{ background: "var(--sidebar-bg-gradient)" }}>
          <Link href="/admin" className="block px-6 py-6 border-b border-white/5">
            <div className="text-xl font-bold tracking-tight text-white">VEXO <span className="text-accent-cyan">STUDIO</span></div>
          </Link>
          <nav className="py-4">
            <Link href="/projects" className="block px-6 py-2 text-sm font-medium hover:bg-white/5 hover:text-white border-s-[3px] border-transparent"><span className="rtl:hidden">← Back to Projects</span><span className="ltr:hidden">→ חזרה לפרויקטים</span></Link>
          </nav>
        </aside>
        <div className="flex-1 flex flex-col">
          <Topbar title="Episode" />
          <main className="flex-1 p-6 overflow-y-auto"><AutoT>{children}</AutoT></main>
        <AiAssistant />
        </div>
      </div>
    </AuthGuard>
  );
}
