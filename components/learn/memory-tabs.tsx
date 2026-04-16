import Link from "next/link";

export default function MemoryTabs({ active }: { active: "prompts" | "guides" }) {
  return (
    <div className="flex gap-1 mb-6 bg-slate-900/60 border border-slate-800 rounded-lg p-1 w-fit">
      <Link
        href="/learn/sources"
        className={`px-5 py-2 rounded text-sm font-medium transition whitespace-nowrap ${
          active === "prompts" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
        }`}
      >
        📝 פרומפטים
      </Link>
      <Link
        href="/learn/guides"
        className={`px-5 py-2 rounded text-sm font-medium transition whitespace-nowrap ${
          active === "guides" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
        }`}
      >
        📖 מדריכים
      </Link>
    </div>
  );
}
