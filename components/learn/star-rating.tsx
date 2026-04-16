"use client";

import { useState, useTransition } from "react";
import { adminHeaders } from "@/lib/learn/admin-key";

export default function StarRating({
  sourceId,
  initialRating,
  size = "md",
  readOnly = false,
}: {
  sourceId: string;
  initialRating: number | null;
  size?: "sm" | "md" | "lg";
  readOnly?: boolean;
}) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [hover, setHover] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState("");

  const sizeClass = size === "sm" ? "text-sm" : size === "lg" ? "text-3xl" : "text-xl";

  function save(newRating: number | null) {
    if (readOnly) return;
    const prev = rating;
    setRating(newRating);
    setErr("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/learn/rate", {
          method: "POST",
          headers: adminHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ sourceId, rating: newRating }),
        });
        const j = await res.json();
        if (!res.ok || !j.ok) {
          setRating(prev);
          setErr(j.error || `HTTP ${res.status}`);
        }
      } catch (e: any) {
        setRating(prev);
        setErr(e.message || "שגיאה");
      }
    });
  }

  function handleClick(n: number) {
    save(rating === n ? null : n);
  }

  const display = hover ?? rating ?? 0;

  return (
    <div className="inline-flex items-center gap-2" dir="ltr">
      <div className={`inline-flex ${sizeClass} ${pending ? "opacity-60" : ""}`}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= display;
          return (
            <button
              key={n}
              type="button"
              onClick={() => handleClick(n)}
              onMouseEnter={() => !readOnly && setHover(n)}
              onMouseLeave={() => setHover(null)}
              disabled={readOnly || pending}
              className={`${filled ? "text-amber-400" : "text-slate-600"} ${
                readOnly ? "cursor-default" : "cursor-pointer hover:scale-110"
              } transition-transform leading-none px-0.5`}
              aria-label={`${n} כוכבים`}
            >
              {filled ? "★" : "☆"}
            </button>
          );
        })}
      </div>
      {rating && !readOnly && size !== "sm" && (
        <button
          type="button"
          onClick={() => save(null)}
          disabled={pending}
          className="text-[10px] text-slate-500 hover:text-red-400"
          title="הסר דירוג"
        >
          ✕
        </button>
      )}
      {err && <span className="text-[10px] text-red-400">{err}</span>}
    </div>
  );
}
