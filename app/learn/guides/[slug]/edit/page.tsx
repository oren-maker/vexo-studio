import { learnFetch } from "@/lib/learn/fetch";
import { adminHeaders } from "@/lib/learn/admin-key";
import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import GuideEditor from "@/components/learn/guides/guide-editor";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";

export const dynamic = "force-dynamic";

async function fetchGuide(slug: string, lang: string, host: string, proto: string) {
  const res = await fetch(`${proto}://${host}/api/v1/learn/guides/${slug}?lang=${lang}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function GuideEditPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { lang?: string };
}) {
  const lang = isValidLang(searchParams.lang || "") ? (searchParams.lang as string) : DEFAULT_LANG;
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const data = await fetchGuide(params.slug, lang, host, proto);
  if (!data?.guide) notFound();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/learn/guides" className="text-xs text-slate-400 hover:text-cyan-400">
          ← ספריית מדריכים
        </Link>
        <Link
          href={`/learn/guides/${params.slug}?lang=${lang}`}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          👁 צפה במדריך המלא
        </Link>
      </div>
      <GuideEditor initialGuide={data.guide} initialLang={lang} />
    </div>
  );
}
