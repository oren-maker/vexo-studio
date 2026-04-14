"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Role = { id: string; name: string; description: string | null; permissions: { permission: { key: string } }[] };

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => { api<Role[]>("/api/v1/roles").then(setRoles).catch(() => {}); }, []);

  return (
    <Card title="Roles & Permissions" subtitle="Default seed contains 7 roles and 24 permissions">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((r) => (
          <div key={r.id} className="border border-bg-main rounded-card p-4">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-semibold">{r.name}</span>
              <span className="text-xs text-text-muted">{r.permissions.length} permissions</span>
            </div>
            <div className="text-xs text-text-secondary mb-3">{r.description ?? "—"}</div>
            <div className="flex flex-wrap gap-1">
              {r.permissions.map((p) => (
                <span key={p.permission.key} className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-main">{p.permission.key}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
