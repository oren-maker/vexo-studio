import { NextRequest, NextResponse } from "next/server";
import { extractInstagram } from "@/lib/learn/instagram";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCRAPER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("u") || "";
  if (!url) return NextResponse.json({ error: "?u= required" }, { status: 400 });

  // Direct fetch to inspect what regex patterns hit
  const direct: any = {};
  try {
    const r = await fetch(url, { headers: { "User-Agent": SCRAPER_UA }, signal: AbortSignal.timeout(15000) });
    direct.status = r.status;
    if (r.ok) {
      const html = await r.text();
      direct.htmlLen = html.length;
      direct.matches = {
        video_url: html.match(/"video_url":"([^"]{1,100})/)?.[1] || null,
        video_versions_dotall: html.match(/"video_versions":\s*\[\s*\{[\s\S]{0,500}?"url":\s*"([^"]{1,200})/)?.[1] || null,
        video_versions_orig: html.match(/"video_versions":\[\{[^}]*"url":"([^"]+)"/)?.[1]?.slice(0, 200) || null,
        playback_url: html.match(/"playback_url":"([^"]{1,100})/)?.[1] || null,
        og_video: html.match(/<meta\s+property="og:video"\s+content="([^"]{1,100})/i)?.[1] || null,
        contains_video_versions: html.includes('"video_versions"'),
        contains_video_url: html.includes('"video_url"'),
        contains_playback_url: html.includes('"playback_url"'),
      };
    }
  } catch (e: any) {
    direct.error = String(e?.message || e).slice(0, 200);
  }

  let extract: any = null;
  try {
    extract = await extractInstagram(url);
  } catch (e: any) {
    extract = { error: String(e?.message || e).slice(0, 200) };
  }

  return NextResponse.json({ direct, extract });
}
