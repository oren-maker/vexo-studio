"use client";

import { useState, useTransition } from "react";
import { adminHeaders } from "@/lib/learn/admin-key";

export default function GuideStarRating({
  slug,
  initialRating,
  size = "md",
}: {
  slug: string;
  initialRating: number | null;
  size?: "sm" | "md" | "lg";
}) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [hover, setHover] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState("");

  const sizeClass = size === "sm" ? "text-sm" : size === "lg" ? "text-3xl" : "text-xl";

  function save(newRating: number | null, e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    const prev = rating;
    setRating(newRating);
    setErr("");
    startTransition(async () => {
      try {
        const res = await fetch(`/api/guides/${slug}/rate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...adminHeaders() },
          body: JSON.stringify({ rating: newRating }),
        });
        if (!res.ok) {
          setRating(prev);
          setErr(res.status === 401 ? "צריך admin key" : `שגיאה ${res.status}`);
        }
      } catch (e: any) {
        setRating(prev);
        setErr(e?.message || "error");
      }
    });
  }

  const display = hover ?? rating ?? 0;

  return (
    <div className="inline-flex items-center gap-1" dir="ltr" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <div className={`inline-flex ${sizeClass} ${pending ? "opacity-60" : ""}`}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= display;
          return (
            <button
              key={n}
              type="button"
              onClick={(e) => save(rating === n ? null : n, e)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(null)}
              disabled={pending}
              className={`${filled ? "text-amber-400" : "text-slate-600"} cursor-pointer hover:scale-110 transition-transform leading-none px-0.5`}
              aria-label={`${n} כוכבים`}
            >
              {filled ? "★" : "☆"}
            </button>
          );
        })}
      </div>
      {err && <span className="text-[10px] text-red-400">{err}</span>}
    </div>
  );
}
