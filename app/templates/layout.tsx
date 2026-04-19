"use client";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { Topbar } from "@/components/topbar";
import { AiAssistant } from "@/components/ai-assistant";
import { CommandPalette } from "@/components/command-palette";
import { RtlEffect } from "@/components/rtl-effect";
import { AutoT } from "@/components/translator";
import { useT } from "@/lib/i18n";

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <AuthGuard>
      <RtlEffect />
      <div className="min-h-screen flex">
        <aside className="w-[260px] shrink-0 text-sidebar-text" style={{ background: "var(--sidebar-bg-gradient)" }}>
          <Link href="/admin" className="block px-6 py-6 border-b border-white/5">
            <div className="text-xl font-bold tracking-tight text-white">VEXO <span className="text-accent-cyan">STUDIO</span></div>
          </Link>
          <nav className="py-4">
            <Link href="/admin" className="block px-6 py-2 text-sm font-medium hover:bg-white/5 hover:text-white border-s-[3px] border-transparent">{t("back.admin")}</Link>
            <Link href="/projects" className="block px-6 py-2 text-sm font-medium hover:bg-white/5 hover:text-white border-s-[3px] border-transparent">{t("nav.projects")}</Link>
            <Link href="/templates" className="block px-6 py-2 text-sm font-medium border-s-[3px] border-accent-cyan bg-white/5 text-white">{t("nav.templates")}</Link>
          </nav>
        </aside>
        <div className="flex-1 flex flex-col">
          <Topbar title={t("templates.title")} />
          <main className="flex-1 p-6 overflow-y-auto"><AutoT>{children}</AutoT></main>
        </div>
        <AiAssistant />
        <CommandPalette />
      </div>
    </AuthGuard>
  );
}
