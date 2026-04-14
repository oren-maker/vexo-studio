"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { useLang } from "@/lib/i18n";
import { groupPermissions, categoryLabel, permLabel, permDesc, roleLabel, CATEGORY_META, type PermissionCategory } from "@/lib/permissions-meta";

type Role = { id: string; name: string; description: string | null; permissions: { permission: { key: string } }[] };

const ALL_CATS: PermissionCategory[] = ["workspace", "finance", "providers", "content", "production", "distribution", "ai", "logs", "platform"];

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const lang = useLang();
  useEffect(() => { api<Role[]>("/api/v1/roles").then(setRoles).catch(() => {}); }, []);

  const t = lang === "he";
  const totalPerms = 24;

  return (
    <Card
      title={t ? "תפקידים והרשאות" : "Roles & Permissions"}
      subtitle={t ? `${roles.length} תפקידים, ${totalPerms} הרשאות, מקובצות לפי קטגוריה. רחף מעל הרשאה לתיאור.` : `${roles.length} roles, ${totalPerms} permissions, grouped by category. Hover any permission for description.`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {roles.map((r) => {
          const keys = r.permissions.map((p) => p.permission.key);
          const grouped = groupPermissions(keys);
          return (
            <div key={r.id} className="border border-bg-main rounded-card p-5 bg-bg-card">
              <div className="flex items-baseline justify-between mb-3 gap-3">
                <div>
                  <div className="text-lg font-bold">{roleLabel(r.name, lang)}</div>
                  <div className="text-[10px] uppercase tracking-widest text-text-muted font-mono">{r.name}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-bg-main whitespace-nowrap">
                  {keys.length} / {totalPerms} {t ? "הרשאות" : "permissions"}
                </span>
              </div>

              {keys.length === 0 ? (
                <div className="text-text-muted text-sm">{t ? "אין הרשאות" : "No permissions"}</div>
              ) : (
                <div className="space-y-3">
                  {ALL_CATS.filter((c) => grouped[c]?.length).map((cat) => (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_META[cat].color }} />
                        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: CATEGORY_META[cat].color }}>
                          {categoryLabel(cat, lang)}
                        </span>
                        <span className="text-[10px] text-text-muted">({grouped[cat].length})</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {grouped[cat].map((p) => (
                          <span
                            key={p.key}
                            title={permDesc(p.key, lang)}
                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-bg-main hover:bg-accent/10 transition cursor-help"
                          >
                            <span aria-hidden>{p.icon}</span>
                            <span>{permLabel(p.key, lang)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
