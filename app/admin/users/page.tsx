"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, EmptyState } from "@/components/page-shell";
import { T, useTr } from "@/components/translator";
import { roleLabel } from "@/lib/permissions-meta";
import { useLang } from "@/lib/i18n";

type Row = {
  id: string; isOwner: boolean;
  user: { id: string; email: string; fullName: string; isActive: boolean; lastLoginAt: string | null; totpEnabled: boolean };
  role: { id: string; name: string };
};

export default function UsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const lang = useLang();
  const never = useTr("Never");

  useEffect(() => {
    api<Row[]>("/api/v1/users").then(setRows).catch((e) => setErr(e.message));
  }, []);

  return (
    <Card title="Users" subtitle="Members of the current organization">
      {err && <div className="text-status-errText text-sm mb-3">{err}</div>}
      {!err && rows.length === 0 ? (
        <EmptyState icon="👤" title="No members" body="Invite a teammate to get started." />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-start text-[11px] uppercase tracking-widest text-text-muted">
            <tr className="border-b border-bg-main">
              <th className="py-2 font-semibold text-start"><T>Name</T></th>
              <th className="py-2 font-semibold text-start"><T>Email</T></th>
              <th className="py-2 font-semibold text-start"><T>Role</T></th>
              <th className="py-2 font-semibold text-start"><T>2FA</T></th>
              <th className="py-2 font-semibold text-start"><T>Active</T></th>
              <th className="py-2 font-semibold text-start"><T>Last login</T></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-bg-main hover:bg-bg-main/50">
                <td className="py-3 font-medium">{r.user.fullName}{r.isOwner && <span className="ms-2 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent"><T>OWNER</T></span>}</td>
                <td className="py-3 text-text-secondary">{r.user.email}</td>
                <td className="py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-bg-main">{roleLabel(r.role.name, lang)}</span></td>
                <td className="py-3">{r.user.totpEnabled ? "✓" : "—"}</td>
                <td className="py-3">{r.user.isActive ? "✓" : "—"}</td>
                <td className="py-3 text-text-muted text-xs">{r.user.lastLoginAt ? new Date(r.user.lastLoginAt).toLocaleString() : never}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
