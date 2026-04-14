"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

export default function ProjectIdLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const lang = useLang();
  const [name, setName] = useState<string>("");

  useEffect(() => {
    api<{ project?: { name: string }; name?: string }>(`/api/v1/projects/${id}`).then((p) => {
      setName(p.project?.name ?? p.name ?? "");
    }).catch(() => {});
  }, [id]);

  // Only show the back link on sub-pages, not on the project root
  const isRoot = pathname === `/projects/${id}`;

  return (
    <div className="space-y-4">
      {!isRoot && (
        <Link
          href={`/projects/${id}`}
          className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
        >
          ← {name || (lang === "he" ? "חזרה לפרויקט" : "Back to project")}
        </Link>
      )}
      {children}
    </div>
  );
}
