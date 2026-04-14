"use client";
import { T } from "./translator";

export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-bg-main p-10 text-center">
      <div className="text-3xl mb-2" aria-hidden>{icon}</div>
      <div className="font-semibold mb-1"><T>{title}</T></div>
      <div className="text-text-muted text-sm mb-4"><T>{body}</T></div>
      {action}
    </div>
  );
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main">
      <h2 className="text-lg font-semibold mb-1"><T>{title}</T></h2>
      {subtitle && <p className="text-text-secondary text-sm mb-6"><T>{subtitle}</T></p>}
      {children}
    </div>
  );
}

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold"><T>{title}</T></h1>
      {action}
    </div>
  );
}
