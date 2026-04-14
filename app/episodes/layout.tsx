"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { Topbar } from "@/components/topbar";
import { AiAssistant } from "@/components/ai-assistant";
import { RtlEffect } from "@/components/rtl-effect";
import { AutoT } from "@/components/translator";
import { ProjectNav } from "@/components/project-nav";
import { api } from "@/lib/api";

export default function EpisodesLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      try {
        const ep = await api<{ seasonId: string }>(`/api/v1/episodes/${params.id}`);
        const s  = await api<{ series: { projectId: string } }>(`/api/v1/seasons/${ep.seasonId}`);
        setProjectId(s.series.projectId);
      } catch { /* ignore */ }
    })();
  }, [params.id]);

  return (
    <AuthGuard>
      <RtlEffect />
      <div className="min-h-screen flex">
        <aside className="w-[260px] shrink-0 text-sidebar-text overflow-y-auto" style={{ background: "var(--sidebar-bg-gradient)" }}>
          <Link href="/admin" className="block px-6 py-5 border-b border-white/5">
            <div className="text-xl font-bold tracking-tight text-white">VEXO <span className="text-accent-cyan">STUDIO</span></div>
          </Link>
          <Link href="/projects" className="block px-6 py-2 text-sm text-sidebar-text hover:text-white hover:bg-white/5">← Projects</Link>
          <ProjectNav projectId={projectId} />
        </aside>
        <div className="flex-1 flex flex-col">
          <Topbar title="Episode" />
          <main className="flex-1 p-6 overflow-y-auto"><AutoT>{children}</AutoT></main>
        </div>
        <AiAssistant />
      </div>
    </AuthGuard>
  );
}
