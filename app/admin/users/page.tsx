"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, EmptyState } from "@/components/page-shell";
import { useTr } from "@/components/translator";
import { roleLabel } from "@/lib/permissions-meta";
import { useLang } from "@/lib/i18n";

type Row = {
  id: string; isOwner: boolean;
  user: { id: string; email: string; fullName: string; isActive: boolean; lastLoginAt: string | null; totpEnabled: boolean };
  role: { id: string; name: string };
};

type Role = { id: string; name: string };

export default function UsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const lang = useLang();
  const he = lang === "he";
  const never = useTr("Never");

  async function load() {
    api<Row[]>("/api/v1/users").then(setRows).catch((e) => setErr(e.message));
    api<Role[]>("/api/v1/roles").then(setRoles).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    const get = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement)?.value || "";
    setBusy(true);
    setErr(null);
    try {
      await api("/api/v1/users", {
        method: "POST",
        body: {
          fullName: get("fullName"),
          email: get("email"),
          username: get("username"),
          password: get("password"),
          roleId: get("roleId"),
          isActive: true,
        },
      });
      f.reset();
      setCreating(false);
      load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Card title={he ? "משתמשים" : "Users"} subtitle={he ? "חברי הארגון הנוכחי" : "Members of the current organization"}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setCreating((v) => !v)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">
          {creating ? (he ? "בטל" : "Cancel") : `+ ${he ? "משתמש חדש" : "New user"}`}
        </button>
      </div>

      {creating && (
        <form onSubmit={add} className="bg-bg-main rounded-lg p-4 mb-4 grid grid-cols-2 gap-2">
          <input name="fullName" required minLength={2} placeholder={he ? "שם מלא" : "Full name"} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
          <input name="email"    required type="email"  placeholder={he ? "אימייל" : "Email"} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
          <input name="username" required minLength={3} placeholder={he ? "שם משתמש (לכניסה)" : "Username (login)"} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
          <input name="password" required minLength={8} type="password" placeholder={he ? "סיסמה (לפחות 8 תווים)" : "Password (min 8)"} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
          <select name="roleId" required className="px-3 py-2 rounded-lg border border-bg-main bg-white col-span-2">
            <option value="">{he ? "בחר תפקיד…" : "Select role…"}</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r.name, lang)} ({r.name})</option>)}
          </select>
          <button disabled={busy} className="col-span-2 px-4 py-2 rounded-lg bg-accent text-white text-sm disabled:opacity-50">
            {busy ? (he ? "יוצר…" : "Creating…") : (he ? "צור משתמש" : "Create user")}
          </button>
        </form>
      )}

      {err && <div className="text-status-errText text-sm mb-3">{err}</div>}
      {!err && rows.length === 0 ? (
        <EmptyState icon="👤" title={he ? "אין חברים" : "No members"} body={he ? "הזמן חבר צוות כדי להתחיל." : "Invite a teammate to get started."} />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-start text-[11px] uppercase tracking-widest text-text-muted">
            <tr className="border-b border-bg-main">
              <th className="py-2 font-semibold text-start">{he ? "שם" : "Name"}</th>
              <th className="py-2 font-semibold text-start">{he ? "אימייל" : "Email"}</th>
              <th className="py-2 font-semibold text-start">{he ? "תפקיד" : "Role"}</th>
              <th className="py-2 font-semibold text-start">{he ? "אימות דו-שלבי" : "2FA"}</th>
              <th className="py-2 font-semibold text-start">{he ? "פעיל" : "Active"}</th>
              <th className="py-2 font-semibold text-start">{he ? "כניסה אחרונה" : "Last login"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-bg-main hover:bg-bg-main/50">
                <td className="py-3 font-medium">{r.user.fullName}{r.isOwner && <span className="ms-2 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{he ? "בעלים" : "OWNER"}</span>}</td>
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
