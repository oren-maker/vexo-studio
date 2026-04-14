"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useMe } from "@/components/auth-guard";

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg-card rounded-card shadow-card p-5 border border-bg-main">
      <div className="text-xs uppercase tracking-widest text-text-muted">{label}</div>
      <div className="mt-2 text-3xl font-bold num" style={{ color }}>{value}</div>
    </div>
  );
}

type Project = { id: string; name: string; status: string };
type Provider = { id: string; name: string; isActive: boolean };

export default function AdminDashboard() {
  const { me } = useMe();
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    api<Project[]>("/api/v1/projects").then(setProjects).catch(() => {});
    api<Provider[]>("/api/v1/providers").then(setProviders).catch(() => {});
  }, []);

  const activeProjects = projects.filter((p) => p.status !== "ARCHIVED").length;
  const activeProviders = providers.filter((p) => p.isActive).length;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Kpi label="Active projects" value={String(activeProjects)} color="#0091d4" />
        <Kpi label="Active providers" value={String(activeProviders)} color="#1db868" />
        <Kpi label="Plan" value={me?.user?.organizations?.[0]?.organization?.plan ?? "—"} color="#1a2540" />
        <Kpi label="Members" value="1+" color="#1a2540" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent projects</h2>
            <Link href="/projects" className="text-sm text-accent">View all →</Link>
          </div>
          {projects.length === 0 ? (
            <div className="text-sm text-text-muted">No projects yet. <Link href="/projects/new" className="text-accent">Create one</Link>.</div>
          ) : (
            <ul className="space-y-2">
              {projects.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 border-b border-bg-main last:border-0">
                  <Link href={`/projects/${p.id}`} className="font-medium hover:text-accent">{p.name}</Link>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-bg-main text-text-secondary">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main">
          <h2 className="text-lg font-semibold mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/projects/new" className="px-4 py-3 rounded-lg border border-bg-main hover:bg-bg-main text-sm font-medium">+ New project</Link>
            <Link href="/admin/users" className="px-4 py-3 rounded-lg border border-bg-main hover:bg-bg-main text-sm font-medium">Manage users</Link>
            <Link href="/admin/providers" className="px-4 py-3 rounded-lg border border-bg-main hover:bg-bg-main text-sm font-medium">Add provider</Link>
            <Link href="/admin/api-keys" className="px-4 py-3 rounded-lg border border-bg-main hover:bg-bg-main text-sm font-medium">API keys</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
