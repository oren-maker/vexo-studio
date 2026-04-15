import { NextRequest, NextResponse } from "next/server";
import { instagramGetUrl } from "instagram-url-direct";

export const runtime = "nodejs";
export const maxDuration = 60;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const SCRAPER_UAS = [
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
  "WhatsApp/2.21",
  "TelegramBot (like TwitterBot)",
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("u") || "";
  if (!url) return NextResponse.json({ error: "?u=<instagram url> required" }, { status: 400 });

  const out: any = { url };

  try {
    const r = await instagramGetUrl(url);
    out.library = { ok: true, urlListLen: r?.url_list?.length || 0, firstUrl: r?.url_list?.[0]?.slice(0, 200) || null };
  } catch (e: any) {
    out.library = { ok: false, error: String(e?.message || e).slice(0, 300) };
  }

  const m = url.match(/instagram\.com\/(reel|p|tv)\/([^/?]+)/i);
  const embedUrl = m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed/captioned/` : null;
  out.embedUrl = embedUrl;

  const targets = [url, embedUrl].filter(Boolean) as string[];
  const uas = [BROWSER_UA, ...SCRAPER_UAS];
  for (const target of targets) for (const ua of uas) {
    const label = `${target === url ? "canonical" : "embed"}_${ua.split("/")[0]}`;
    try {
      const res = await fetch(target, {
        headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9", "Accept": "text/html" },
        signal: AbortSignal.timeout(15000),
      });
      const item: any = { status: res.status, contentType: res.headers.get("content-type") };
      if (res.ok) {
        const html = await res.text();
        item.htmlLength = html.length;
        item.found = {
          ogVideo: html.match(/<meta\s+property="og:video"\s+content="([^"]*)"/i)?.[1]?.slice(0, 200) || null,
          ogImage: html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i)?.[1]?.slice(0, 200) || null,
          ogDesc: html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i)?.[1]?.slice(0, 200) || null,
          jsonVideo: html.match(/"video_url":"([^"]+)"/)?.[1]?.slice(0, 200) || null,
          videoVersions: html.match(/"video_versions":\[\{[^}]*"url":"([^"]+)"/)?.[1]?.slice(0, 200) || null,
          playbackUrl: html.match(/"playback_url":"([^"]+)"/)?.[1]?.slice(0, 200) || null,
          videoDashManifest: html.match(/"video_dash_manifest":"[^"]+/)?.[0]?.slice(0, 100) || null,
          contextJson: html.match(/window\._sharedData\s*=\s*(\{[^<]+\})/)?.[1]?.slice(0, 300) || null,
        };
        // sample text content (first 1500 of body without scripts)
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
        item.bodySample = bodyMatch.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\s+/g, " ").slice(0, 800);
      }
      out[label] = item;
    } catch (e: any) {
      out[label] = { error: String(e?.message || e).slice(0, 300) };
    }
  }

  return NextResponse.json(out);
}
