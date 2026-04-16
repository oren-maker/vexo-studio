import { learnFetch } from "@/lib/learn/fetch";
"use client";

import { adminHeaders } from "@/lib/learn/admin-key";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteSourceButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm("למחוק את המקור לצמיתות?")) return;
    setBusy(true);
    await learnFetch(`/api/v1/learn/sources/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button onClick={onDelete} disabled={busy} className="text-red-400 hover:underline text-xs disabled:opacity-50">
      מחק
    </button>
  );
}
