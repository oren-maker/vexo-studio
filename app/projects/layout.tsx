"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { Topbar } from "@/components/topbar";
import { AiAssistant } from "@/components/ai-assistant";
import { RtlEffect } from "@/components/rtl-effect";
import { AutoT } from "@/components/translator";
import { ProjectNav } from "@/components/project-nav";
import { useT } from "@/lib/i18n";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  // Match /projects/<id> and /projects/<id>/anything, but NOT /projects or /projects/new
  const m = pathname.match(/^\/projects\/([^/]+)(?:\/.*)?$/);
  const projectId = m && m[1] !== "new" ? m[1] : null;

  return (
    <AuthGuard>
      <RtlEffect />
      <div className="min-h-screen flex">
        <aside className="w-[260px] shrink-0 text-sidebar-text overflow-y-auto" style={{ background: "var(--sidebar-bg-gradient)" }}>
          <Link href="/admin" className="block px-6 py-5 border-b border-white/5">
            <div className="text-xl font-bold tracking-tight text-white">VEXO <span className="text-accent-cyan">STUDIO</span></div>
          </Link>

          {projectId ? (
            <>
              <Link href="/projects" className="block px-6 py-2 text-sm text-sidebar-text hover:text-white hover:bg-white/5">← {t("nav.projects")}</Link>
              <ProjectNav projectId={projectId} />
            </>
          ) : (
            <nav className="py-4">
              <Link href="/admin" className="block px-6 py-2 text-sm font-medium hover:bg-white/5 hover:text-white border-s-[3px] border-transparent">{t("back.admin")}</Link>
              <Link href="/projects" className="block px-6 py-2 text-sm font-medium hover:bg-white/5 hover:text-white border-s-[3px] border-accent-cyan bg-white/5 text-white">{t("nav.projects")}</Link>
              <Link href="/projects/new" className="block px-6 py-2 text-sm hover:bg-white/5 hover:text-white border-s-[3px] border-transparent">{t("nav.new.project")}</Link>
              <Link href="/templates" className="block px-6 py-2 text-sm hover:bg-white/5 hover:text-white border-s-[3px] border-transparent">{t("nav.templates")}</Link>
            </nav>
          )}
        </aside>
        <div className="flex-1 flex flex-col">
          <Topbar title={t("nav.projects")} />
          <main className="flex-1 p-6 overflow-y-auto"><AutoT>{children}</AutoT></main>
        </div>
        <AiAssistant />
      </div>
    </AuthGuard>
  );
}
