"use client";

import { useTransition } from "react";
import { deleteVideoAction } from "@/app/learn/sources/[id]/actions";

export default function DeleteFailedVideoButton({ videoId, sourceId }: { videoId: string; sourceId: string }) {
  const [pending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      const r = await deleteVideoAction(videoId, sourceId);
      if (!r.ok) alert(r.error);
    });
  }

  return (
    <button
      onClick={onDelete}
      disabled={pending}
      className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 px-3 py-1 rounded text-[11px] disabled:opacity-50"
    >
      {pending ? "מוחק..." : "🗑 מחק רשומה"}
    </button>
  );
}
