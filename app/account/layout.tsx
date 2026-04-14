"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { Topbar } from "@/components/topbar";
import { AiAssistant } from "@/components/ai-assistant";
import { RtlEffect } from "@/components/rtl-effect";
import { AutoT } from "@/components/translator";
import { useLang } from "@/lib/i18n";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lang = useLang();
  const he = lang === "he";

  const items = [
    { href: "/account/2fa",      label: he ? "אימות דו-שלבי" : "2FA" },
    { href: "/account/sessions", label: he ? "סשנים פעילים" : "Active sessions" },
  ];

  return (
    <AuthGuard>
      <RtlEffect />
      <div className="min-h-screen flex">
        <aside className="w-[260px] shrink-0 text-sidebar-text" style={{ background: "var(--sidebar-bg-gradient)" }}>
          <Link href="/admin" className="block px-6 py-6 border-b border-white/5">
            <div className="text-xl font-bold tracking-tight text-white">VEXO <span className="text-accent-cyan">STUDIO</span></div>
          </Link>
          <nav className="py-4">
            <Link href="/admin" className="block px-6 py-2 text-sm font-medium hover:bg-white/5 hover:text-white border-s-[3px] border-transparent">
              {he ? "→ חזרה לאדמין" : "← Back to admin"}
            </Link>
            <div className="px-6 pt-6 pb-2 text-[10px] uppercase tracking-widest text-sidebar-text/60">{he ? "חשבון" : "Account"}</div>
            {items.map((it) => {
              const active = pathname === it.href;
              return (
                <Link key={it.href} href={it.href} className={`block px-6 py-2 text-sm font-medium border-s-[3px] ${active ? "bg-white/10 text-white border-accent" : "hover:bg-white/5 hover:text-white border-transparent"}`}>
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="flex-1 flex flex-col">
          <Topbar title={he ? "חשבון" : "Account"} />
          <main className="flex-1 p-6 overflow-y-auto"><AutoT>{children}</AutoT></main>
        </div>
        <AiAssistant />
      </div>
    </AuthGuard>
  );
}
