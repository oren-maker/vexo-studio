import Link from "next/link";
import { prisma } from "@/lib/learn/db";
import StatusBadge from "@/components/learn/status-badge";
import RefreshButton from "@/components/learn/refresh-button";
import DeleteSourceButton from "@/components/learn/delete-source-button";
import StarRating from "@/components/learn/star-rating";
import ModuleHeader from "@/components/learn/module-header";
import MemoryTabs from "@/components/learn/memory-tabs";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Any addedBy that indicates AI-origin (compose, variations, auto-improve, corpus generator, etc.)
const AI_KEYWORDS = ["compose", "variation", "gemini", "corpus-generator", "corpus-", "auto-improve", "ai-", "claude-"];
const MANUAL_KEYWORDS = ["manual", "bulk-import", "json-import", "csv-import", "upload"];

function isAiAddedBy(addedBy: string | null): boolean {
  if (!addedBy) return false;
  const n = addedBy.toLowerCase();
  return AI_KEYWORDS.some((k) => n.includes(k));
}
function isManualAddedBy(addedBy: string | null): boolean {
  if (!addedBy) return false;
  const n = addedBy.toLowerCase();
  return MANUAL_KEYWORDS.some((k) => n === k || n.includes(k));
}

export default async function SourcesManager({
  searchParams,
}: {
  searchParams: { page?: string; filter?: string; minRating?: string; sort?: string; category?: string; q?: string };
}) {
  const page = Math.max(1, Number(searchParams.page || 1));
  const filter = searchParams.filter || "all";
  const category = searchParams.category || "";
  const minRating = Number(searchParams.minRating || 0);
  const sort = searchParams.sort || "createdAt";
  const q = (searchParams.q || "").trim();
  const skip = (page - 1) * PAGE_SIZE;

  const where: any = filter === "all" ? {} : { addedBy: { contains: filter, mode: "insensitive" as const } };
  if (minRating >= 1 && minRating <= 5) where.userRating = { gte: minRating };
  if (q) {
    where.AND = (where.AND || []).concat([{
      OR: [
        { prompt: { contains: q, mode: "insensitive" as const } },
        { title: { contains: q, mode: "insensitive" as const } },
      ],
    }]);
  }

  // Category-based filter (AI / imported / manual / analyzed / with-video)
  if (category === "ai") {
    where.OR = AI_KEYWORDS.map((k) => ({ addedBy: { contains: k, mode: "insensitive" as const } }));
  } else if (category === "manual") {
    where.OR = MANUAL_KEYWORDS.map((k) => ({ addedBy: { contains: k, mode: "insensitive" as const } }));
  } else if (category === "imported") {
    where.AND = [
      { NOT: { OR: AI_KEYWORDS.map((k) => ({ addedBy: { contains: k, mode: "insensitive" as const } })) } },
      { NOT: { OR: MANUAL_KEYWORDS.map((k) => ({ addedBy: { contains: k, mode: "insensitive" as const } })) } },
    ];
  } else if (category === "analyzed") {
    where.analysis = { is: {} };
  } else if (category === "with-video") {
    where.blobUrl = { not: null };
  } else if (category === "all") {
    // explicit "all" - no extra filter
  }

  const orderBy: any = sort === "rating"
    ? [{ userRating: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
    : sort === "views"
    ? [{ viewCount: "desc" }, { createdAt: "desc" }]
    : { createdAt: "desc" };

  const [sources, total, withAnalysis, withVideo, byAddedBy, nodeCount, filteredTotal] = await Promise.all([
    prisma.learnSource.findMany({
      where,
      orderBy,
      take: PAGE_SIZE,
      skip,
    }),
    prisma.learnSource.count(),
    prisma.learnSource.count({ where: { analysis: { is: {} } } }),
    prisma.learnSource.count({ where: { blobUrl: { not: null } } }),
    prisma.learnSource.groupBy({
      by: ["addedBy"],
      _count: true,
      orderBy: { _count: { addedBy: "desc" } },
      take: 60,
    }),
    prisma.knowledgeNode.count(),
    prisma.learnSource.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  // Categorize sources by origin
  let imported = 0;
  let aiGenerated = 0;
  let manual = 0;
  for (const row of byAddedBy) {
    const n = row._count as unknown as number;
    if (isAiAddedBy(row.addedBy)) aiGenerated += n;
    else if (isManualAddedBy(row.addedBy)) manual += n;
    else imported += n; // seedance-sync, sora-ease, hr98w, etc.
  }

  return (
    <div className="max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-white">🧠 זיכרון</h1>
          <p className="text-sm text-slate-400 mt-1">כל מה שהבמאי יודע — פרומפטים שנותחו ומדריכים מובנים.</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton />
          <Link
            href="/learn/sources/new"
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2 rounded-lg text-sm"
          >
            ➕ הוסף URL
          </Link>
        </div>
      </header>

      <MemoryTabs active="prompts" />

      <ModuleHeader
        title="📝 פרומפטים"
        operations={["compose", "improve", "video-analysis", "image-gen"]}
        logsTab="usage"
      />

      <form action="/learn/sources" className="mb-6">
        <div className="relative">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="🔍 חפש בכותרת או בפרומפט..."
            className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500/60 rounded-lg px-4 py-3 text-sm text-slate-100 outline-none"
          />
          {q && (
            <Link
              href="/learn/sources"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-red-400"
            >
              ✕ נקה
            </Link>
          )}
        </div>
      </form>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard value={total} label="פרומפטים במאגר" accent="white" hint="סה״כ LearnSources" href="/learn/sources?category=all" active={category === "all" || (!category && filter === "all")} />
        <StatCard value={withAnalysis} label="נותחו ללמידה" accent="cyan" hint={`${Math.round((withAnalysis / Math.max(total, 1)) * 100)}% מהמאגר`} href="/learn/sources?category=analyzed" active={category === "analyzed"} />
        <StatCard value={nodeCount} label="Knowledge Nodes" accent="purple" hint="זמינים ל-AI Director" href="/learn/knowledge" />
        <StatCard value={aiGenerated} label="נוצרו ב-AI" accent="emerald" hint="compose + variations + corpus" href="/learn/sources?category=ai" active={category === "ai"} />
        <StatCard value={imported} label="יובאו ממקורות" accent="amber" hint="Seedance, Sora…" href="/learn/sources?category=imported" active={category === "imported"} />
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider">פילוח לפי מקור (לחיצה מסננת)</div>
          <div className="flex gap-2">
            <Link href="/learn/sources?category=manual" className={`text-[11px] px-2 py-1 rounded border ${category === "manual" ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"}`}>
              ✍️ ידני · {manual}
            </Link>
            <Link href="/learn/sources?category=with-video" className={`text-[11px] px-2 py-1 rounded border ${category === "with-video" ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"}`}>
              🎬 עם וידאו · {withVideo}
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {byAddedBy.slice(0, 20).map((row) => {
            const name = row.addedBy || "(ללא מקור)";
            const count = row._count as unknown as number;
            const active = filter !== "all" && name.toLowerCase().includes(filter.toLowerCase());
            return (
              <Link
                key={name}
                href={`/learn/sources?filter=${encodeURIComponent(name)}`}
                className={`text-xs px-3 py-1 rounded-full border transition ${
                  active
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                    : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                {prettyAddedBy(name)} <span className="text-slate-500">· {count}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {(category || filter !== "all" || minRating > 0) && (
        <div className="flex items-center gap-2 mb-4 text-xs">
          <span className="text-slate-500">סינון פעיל:</span>
          {category && <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-1 rounded">{categoryLabel(category)}</span>}
          {filter !== "all" && <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded">{prettyAddedBy(filter)}</span>}
          {minRating > 0 && <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-1 rounded">{"★".repeat(minRating)}+</span>}
          <Link href="/learn/sources" className="text-slate-400 hover:text-red-400 underline">נקה הכל</Link>
          <span className="text-slate-500 mr-auto font-mono">{filteredTotal.toLocaleString()} תוצאות</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <span className="text-slate-500">סנן לפי דירוג:</span>
        {[0, 1, 2, 3, 4, 5].map((n) => {
          const params = new URLSearchParams();
          if (n > 0) params.set("minRating", String(n));
          if (sort === "rating") params.set("sort", "rating");
          const href = `/learn/sources${params.toString() ? `?${params}` : ""}`;
          const active = minRating === n;
          return (
            <Link
              key={n}
              href={href}
              className={`px-3 py-1 rounded-full border ${
                active ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              {n === 0 ? "הכל" : `${"★".repeat(n)}+`}
            </Link>
          );
        })}
        <span className="text-slate-500 mr-4">מיון:</span>
        <Link
          href={`/learn/sources${minRating ? `?minRating=${minRating}` : ""}`}
          className={`px-3 py-1 rounded-full border ${!sort || sort === "createdAt" ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300" : "bg-slate-900 border-slate-700 text-slate-400"}`}
        >
          📅 חדשים
        </Link>
        <Link
          href={`/learn/sources?sort=views${minRating ? `&minRating=${minRating}` : ""}`}
          className={`px-3 py-1 rounded-full border ${sort === "views" ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" : "bg-slate-900 border-slate-700 text-slate-400"}`}
        >
          👁 הכי נצפים
        </Link>
        <Link
          href={`/learn/sources?sort=rating${minRating ? `&minRating=${minRating}` : ""}`}
          className={`px-3 py-1 rounded-full border ${sort === "rating" ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-slate-900 border-slate-700 text-slate-400"}`}
        >
          ⭐ דירוג גבוה
        </Link>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/60 text-right text-xs text-slate-400 uppercase">
              <th className="px-4 py-3">סטטוס</th>
              <th className="px-4 py-3">כותרת / פרומפט</th>
              <th className="px-4 py-3">דירוג</th>
              <th className="px-4 py-3">צפיות</th>
              <th className="px-4 py-3">סוג</th>
              <th className="px-4 py-3">נוצר</th>
              <th className="px-4 py-3 text-left">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sources.map((s) => (
              <tr key={s.id} className="hover:bg-slate-800/30">
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3">
                  <div className="font-medium text-white line-clamp-1">{s.title || "—"}</div>
                  <div className="text-xs text-slate-400 line-clamp-1">{s.prompt}</div>
                  {s.error && <div className="text-xs text-red-400 mt-1">⚠ {s.error}</div>}
                </td>
                <td className="px-4 py-3"><StarRating sourceId={s.id} initialRating={s.userRating} size="sm" /></td>
                <td className="px-4 py-3 text-xs text-slate-400">👁 {s.viewCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{s.type}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(s.createdAt).toLocaleDateString("he-IL")}
                </td>
                <td className="px-4 py-3 text-left">
                  <div className="flex gap-2 justify-end">
                    <Link href={`/learn/sources/${s.id}`} className="text-cyan-400 hover:underline text-xs">
                      פתח
                    </Link>
                    <DeleteSourceButton id={s.id} />
                  </div>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  אין מקורות. <Link href="/learn/sources/new" className="text-cyan-400 underline">הוסף ראשון</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} total={filteredTotal} pageSize={PAGE_SIZE} filter={filter} category={category} minRating={minRating} sort={sort} />
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, total, pageSize, filter, category, minRating, sort }: { page: number; totalPages: number; total: number; pageSize: number; filter: string; category?: string; minRating?: number; sort?: string }) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function buildUrl(p: number) {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    if (filter && filter !== "all") params.set("filter", filter);
    if (category) params.set("category", category);
    if (minRating && minRating > 0) params.set("minRating", String(minRating));
    if (sort && sort !== "createdAt") params.set("sort", sort);
    const q = params.toString();
    return `/learn/sources${q ? `?${q}` : ""}`;
  }

  // Build page numbers: always show 1, last, current±2
  const candidates = [1, totalPages, page, page - 1, page + 1, page - 2, page + 2];
  const seen = new Set<number>();
  const visible: number[] = [];
  for (const p of candidates) {
    if (p >= 1 && p <= totalPages && !seen.has(p)) {
      seen.add(p);
      visible.push(p);
    }
  }
  visible.sort((a, b) => a - b);

  return (
    <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between flex-wrap gap-3">
      <div className="text-xs text-slate-500">
        מציג {from}–{to} מתוך {total.toLocaleString()}
      </div>
      <div className="flex items-center gap-1" dir="ltr">
        <PageLink href={page > 1 ? buildUrl(page - 1) : undefined} label="‹ הקודם" />
        {visible.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && p > visible[i - 1] + 1 && <span className="text-slate-600 px-1">…</span>}
            {p === page ? (
              <span className="bg-cyan-500 text-slate-950 font-bold px-3 py-1 rounded text-xs">{p}</span>
            ) : (
              <Link
                href={buildUrl(p)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded text-xs"
              >
                {p}
              </Link>
            )}
          </span>
        ))}
        <PageLink href={page < totalPages ? buildUrl(page + 1) : undefined} label="הבא ›" />
      </div>
    </div>
  );
}

function PageLink({ href, label }: { href?: string; label: string }) {
  if (!href) {
    return <span className="text-slate-600 px-2 py-1 text-xs cursor-not-allowed">{label}</span>;
  }
  return (
    <Link href={href} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs">
      {label}
    </Link>
  );
}

function StatCard({ value, label, accent, hint, href, active }: { value: number; label: string; accent: "white" | "cyan" | "purple" | "emerald" | "amber"; hint?: string; href?: string; active?: boolean }) {
  const colorMap = {
    white: "text-white",
    cyan: "text-cyan-300",
    purple: "text-purple-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  };
  const body = (
    <>
      <div className={`text-3xl font-black ${colorMap[accent]}`}>{value.toLocaleString()}</div>
      <div className="text-sm text-slate-300 mt-1">{label}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </>
  );
  const cls = `bg-slate-900/60 border rounded-xl p-4 block transition ${
    active ? "border-cyan-500/60 ring-1 ring-cyan-500/30" : "border-slate-800"
  } ${href ? "hover:border-cyan-500/40 hover:bg-slate-900/80 cursor-pointer" : ""}`;
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  return <div className={cls}>{body}</div>;
}

function categoryLabel(c: string): string {
  return (
    { ai: "נוצרו ב-AI", imported: "יובאו ממקורות", manual: "ידני", analyzed: "נותחו ללמידה", "with-video": "עם וידאו", all: "הכל" }[c] || c
  );
}

function prettyAddedBy(raw: string): string {
  const map: Record<string, string> = {
    "seedance-sync": "🎬 Seedance",
    "sora-ease": "🎭 SoraEase",
    "awesome-sora-prompts (hr98w)": "📘 hr98w Sora",
    "awesome-sora-prompts (xjpp22)": "📗 xjpp22 Sora",
    "awesome-ai-video-prompts": "📕 AI Video",
    "gemini-compose": "✨ חולל AI",
    "bulk-import": "📥 ייבוא JSON",
    "json-import": "📥 JSON",
    "csv-import": "📊 CSV",
    "manual": "✍️ ידני",
  };
  if (map[raw]) return map[raw];
  if (raw.startsWith("aivideo")) return "📕 AI Video";
  if (raw.startsWith("sora-")) return "📘 Sora";
  if (raw.includes("variation")) return "🔁 וריאציה";
  return raw.slice(0, 25);
}
