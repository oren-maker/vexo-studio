// Instagram reel / post → direct MP4 URL + caption + thumbnail.
// Uses instagram-url-direct for the CDN URL. Scrapes og meta tags for caption.

import { instagramGetUrl } from "instagram-url-direct";

export type IgExtract = {
  videoUrl: string | null;
  thumbnail: string | null;
  caption: string | null;
  sourceUrl: string;
};

// Instagram serves a JS shell to regular browser UAs but the FULL server-rendered
// page (with og:* tags + video_versions) to scraper-identifying UAs like facebookexternalhit.
const SCRAPER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER_UA = SCRAPER_UA;

function toEmbedUrl(url: string): string {
  // Instagram's /embed endpoint returns a server-rendered HTML with og:* meta tags
  // even when the main URL serves an empty SPA shell.
  const m = url.match(/instagram\.com\/(reel|p|tv)\/([^/?]+)/i);
  if (!m) return url;
  return `https://www.instagram.com/${m[1]}/${m[2]}/embed/captioned/`;
}

async function fetchMetaTags(url: string): Promise<{ caption: string | null; thumbnail: string | null; videoUrl: string | null }> {
  // Try canonical URL first, then embed URL as fallback (canonical often serves SPA shell with no og tags)
  const best: { caption: string | null; thumbnail: string | null; videoUrl: string | null } = { caption: null, thumbnail: null, videoUrl: null };
  for (const target of [url, toEmbedUrl(url)]) {
    try {
      const res = await fetch(target, {
        headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i)?.[1]
        || html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]
        || null;
      const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i)?.[1] || null;
      const ogVideo =
        html.match(/<meta\s+property="og:video"\s+content="([^"]*)"/i)?.[1] ||
        html.match(/<meta\s+property="og:video:secure_url"\s+content="([^"]*)"/i)?.[1] ||
        null;
      const jsonVideo =
        html.match(/"video_url":"([^"]+)"/)?.[1] ||
        html.match(/"video_versions":\[\{[^}]*"url":"([^"]+)"/)?.[1] ||
        html.match(/"playback_url":"([^"]+)"/)?.[1] ||
        null;

      const caption = ogDesc ? decodeHtmlEntities(ogDesc) : null;
      const thumbnail = ogImage ? decodeHtmlEntities(ogImage) : null;
      const videoUrl = ogVideo
        ? decodeHtmlEntities(ogVideo)
        : jsonVideo
        ? jsonVideo.replace(/\\u0026/g, "&").replace(/\\\//g, "/")
        : null;

      // Merge: keep the most complete result across attempts
      if (caption && !best.caption) best.caption = caption;
      if (thumbnail && !best.thumbnail) best.thumbnail = thumbnail;
      if (videoUrl && !best.videoUrl) best.videoUrl = videoUrl;
      // If we have all three, stop early
      if (best.caption && best.thumbnail && best.videoUrl) break;
    } catch {
      // try next candidate
    }
  }
  return best;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

async function tryInstagramDirect(clean: string): Promise<string | null> {
  // The library currently 5xx's almost always due to IG hardening. One quick attempt only —
  // we get caption+thumbnail from fetchMetaTags regardless, so the library is best-effort.
  try {
    const r = await Promise.race([
      instagramGetUrl(clean),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("library timeout 8s")), 8000)),
    ]);
    return r?.url_list?.[0] || null;
  } catch (e: any) {
    console.warn("[ig] library failed:", String(e?.message || e).slice(0, 200));
    return null;
  }
}

export async function extractInstagram(url: string): Promise<IgExtract> {
  const clean = url.split("?")[0]; // strip tracking params
  // Require instagram.com host to prevent SSRF via spoofed URLs
  try {
    const host = new URL(clean).hostname.toLowerCase();
    if (!host.endsWith("instagram.com") && !host.endsWith("instagr.am")) {
      throw new Error(`Only instagram.com URLs are allowed. Got: ${host}`);
    }
  } catch (e: any) {
    if (e.message?.startsWith("Only instagram")) throw e;
    throw new Error("Invalid Instagram URL");
  }

  // Strategy: run library + HTML meta scrape in parallel. HTML scrape usually works even when library 572s.
  const [libVideoUrl, meta] = await Promise.all([
    tryInstagramDirect(clean).catch(() => null),
    fetchMetaTags(clean),
  ]);

  // Prefer library (gives fresh CDN URL), fall back to meta tag / embedded JSON
  const videoUrl = libVideoUrl || meta.videoUrl;

  if (!videoUrl && !meta.caption && !meta.thumbnail) {
    throw new Error(
      "Instagram חסום זמנית (כנראה הפוסט פרטי או rate-limit). נסה שוב בעוד דקה, או השתמש ב'העלאת קובץ' / 'URL ישיר'.",
    );
  }

  return {
    videoUrl,
    thumbnail: meta.thumbnail,
    caption: meta.caption,
    sourceUrl: clean,
  };
}
