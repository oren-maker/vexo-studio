import { learnFetch } from "@/lib/learn/fetch";
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminHeaders, getAdminKey } from "@/lib/learn/admin-key";

export default function DeleteGuideButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function del(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!getAdminKey()) { alert("הגדר admin key ב-/admin"); return; }
    if (!confirm("למחוק את המדריך?")) return;
    setPending(true);
    try {
      const res = await learnFetch(`/api/v1/learn/guides/${slug}`, { method: "DELETE", headers: adminHeaders() });
      if (res.ok) router.refresh();
      else alert(`שגיאה: ${res.status}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={del}
      disabled={pending}
      className="absolute top-2 left-2 z-10 bg-red-500/80 hover:bg-red-500 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
      title="מחק מדריך"
    >
      {pending ? "..." : "🗑"}
    </button>
  );
}
