"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { GUIDE_LANGUAGES, type GuideLang } from "@/lib/learn/guide-languages";

export default function LanguagePicker({
  current,
  size = "md",
}: {
  current: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function pick(code: GuideLang) {
    const next = new URLSearchParams(sp);
    next.set("lang", code);
    router.push(`${pathname}?${next}`);
  }

  return (
    <div className={`inline-flex flex-wrap gap-1 ${size === "sm" ? "text-[10px]" : "text-xs"}`}>
      {GUIDE_LANGUAGES.map((l) => {
        const active = current === l.code;
        return (
          <button
            key={l.code}
            onClick={() => pick(l.code as GuideLang)}
            className={`px-2 py-1 rounded border transition ${
              active
                ? "bg-cyan-500 text-slate-950 border-cyan-400 font-bold"
                : "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <span className="mr-1">{l.flag}</span>{l.name}
          </button>
        );
      })}
    </div>
  );
}
