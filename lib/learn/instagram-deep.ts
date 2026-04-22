// Deep Instagram extractor — pulls caption + every carousel image + (best-effort)
// video, then runs each media item through Gemini vision so the content of the
// images/videos is available as text (not just the caption).
//
// Why: the old flow imported only the caption. Carousel posts (most text-heavy
// Instagram posts) lose all the info on the slides. This module closes that gap.
//
// Two-tier strategy:
//   1. If IG_SESSION_COOKIE env is set — call the authenticated internal API
//      and get every carousel child. Reliable, full resolution, handles videos.
//   2. Otherwise — fall back to parsing the public embed page (only exposes
//      first 3 slides since IG's 2023 anonymous-auth lock-down).

import { extractInstagram } from "./instagram";

const SCRAPER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const GEMINI_KEY = process.env.GEMINI_API_KEY?.replace(/\\n$/, "").trim();
const VISION_MODEL = "gemini-3-flash-preview";
const IG_APP_ID = "936619743392459";
const SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function shortcodeToMediaId(shortcode: string): string {
  let id = 0n;
  for (const c of shortcode) {
    const idx = SHORTCODE_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error(`invalid shortcode char: ${c}`);
    id = id * 64n + BigInt(idx);
  }
  return id.toString();
}

function parseShortcode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:reel|p|tv)\/([^/?]+)/i);
  return m?.[1] ?? null;
}

// Authenticated carousel fetch — requires a valid Instagram sessionid cookie
// set via the IG_SESSION_COOKIE env var. Returns every carousel child (image
// or video) at the highest available resolution.
async function fetchCarouselAuthed(shortcode: string): Promise<IgMedia[] | null> {
  const sessionid = process.env.IG_SESSION_COOKIE?.trim();
  if (!sessionid) return null;

  const mediaId = shortcodeToMediaId(shortcode);
  const cookieHeader = sessionid.startsWith("sessionid=") ? sessionid : `sessionid=${sessionid}`;
  try {
    const r = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
      headers: {
        "User-Agent": BROWSER_UA,
        "x-ig-app-id": IG_APP_ID,
        "Cookie": cookieHeader,
        "Accept": "*/*",
        "Referer": `https://www.instagram.com/p/${shortcode}/`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      console.warn(`[ig-authed] media/${mediaId} returned ${r.status}`);
      return null;
    }
    const j: any = await r.json();
    const item = j?.items?.[0];
    if (!item) return null;

    const out: IgMedia[] = [];
    const carousel: any[] = Array.isArray(item.carousel_media) ? item.carousel_media : [item];
    carousel.forEach((c, order) => {
      // c.media_type: 1 = image, 2 = video, 8 = sidecar (shouldn't happen inside a child)
      if (c.media_type === 2) {
        const videoUrl = c.video_versions?.[0]?.url;
        if (videoUrl) out.push({ type: "video", url: videoUrl, order });
      } else {
        // image — pick the largest candidate (highest width)
        const candidates: { url: string; width: number }[] = c.image_versions2?.candidates ?? [];
        const best = [...candidates].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
        if (best?.url) out.push({ type: "image", url: best.url, order });
      }
    });
    return out.length > 0 ? out : null;
  } catch (e: any) {
    console.warn(`[ig-authed] failed: ${String(e?.message || e).slice(0, 200)}`);
    return null;
  }
}

export type IgMedia = {
  type: "image" | "video";
  url: string;
  order: number;
};

export type IgDeepExtract = {
  caption: string | null;
  thumbnail: string | null;
  sourceUrl: string;
  media: IgMedia[];
  analyses: { order: number; type: "image" | "video"; url: string; text: string; error?: string }[];
};

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// Instagram serves thumbnails in many resolutions (150x150, 240x240, 640x640,
// 750x750, 1080x1080, etc.). Pick the largest variant per asset-id.
function pickBestVariants(rawUrls: string[]): string[] {
  // Group by the underlying asset id (numeric prefix of the filename before _)
  const byId = new Map<string, { url: string; size: number }>();
  for (const url of rawUrls) {
    // Instagram filenames: <short>_<mediaId 15+ digits>_<variant>_n.<ext>
    // the mediaId is what uniquely identifies the carousel slide.
    const idMatch = url.match(/_([0-9]{15,})_/);
    if (!idMatch) continue;
    const id = idMatch[1];
    // score: "s1080x1080" → 1080, "p1080x1080" → 1080, etc. fallback 0.
    const s = url.match(/[sp](\d{3,4})x\d{3,4}/)?.[1];
    const size = s ? Number(s) : 0;
    const prev = byId.get(id);
    if (!prev || size > prev.size) byId.set(id, { url: decodeHtmlEntities(url), size });
  }
  return [...byId.values()].map((v) => v.url);
}

export async function extractCarouselMedia(embedUrl: string): Promise<IgMedia[]> {
  try {
    const res = await fetch(embedUrl, {
      headers: { "User-Agent": SCRAPER_UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Videos: look for video_url / playback_url
    const videoUrls = [
      ...html.matchAll(/"video_url":"([^"]+)"/g),
      ...html.matchAll(/"playback_url":"([^"]+)"/g),
    ].map((m) => m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/"));

    // Images: look for all carousel image urls (heic/jpg with an asset id)
    const imgUrls = [
      ...html.matchAll(/https:\/\/[^"' ]+\.(?:heic|jpg|jpeg|webp)[^"' ]*/g),
    ].map((m) => m[0])
      // Skip profile pics (small thumbnails / profile_pic paths)
      .filter((u) => !/profile_pic|_s150x150/.test(u));

    const bestImgs = pickBestVariants(imgUrls);
    const bestVideos = [...new Set(videoUrls)];

    const media: IgMedia[] = [];
    let order = 0;
    for (const url of bestVideos) media.push({ type: "video", url, order: order++ });
    for (const url of bestImgs) media.push({ type: "image", url, order: order++ });
    return media;
  } catch { return []; }
}

async function fetchToBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    // Instagram's heic urls return JPEG when ?stp=dst-jpg is present (server-side
    // transcoded). Sniff the first bytes: FFD8 = JPEG, 89504E47 = PNG, RIFF = WEBP.
    let mimeType = "image/jpeg";
    if (buf.length > 4) {
      if (buf[0] === 0x89 && buf[1] === 0x50) mimeType = "image/png";
      else if (buf[0] === 0x52 && buf[1] === 0x49) mimeType = "image/webp";
      else if (buf.length > 12 && buf.slice(4, 12).toString("ascii").startsWith("ftyp")) {
        const brand = buf.slice(8, 12).toString("ascii");
        if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("mif1")) mimeType = "image/heic";
        else mimeType = "video/mp4";
      }
    }
    return { base64: buf.toString("base64"), mimeType };
  } catch { return null; }
}

async function analyzeImage(base64: string, mimeType: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY missing");
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: "חלץ את כל הטקסט, הכותרות, הציטוטים, התרשימים והמידע שמופיעים בתמונה הזו. ענה בעברית. היה יסודי — כלול כל מילה שאתה רואה בתמונה, כולל תגיות, כפתורים, ומספרים. אם זו שקופית מתוך סדרה — תן כותרת קצרה בשורה הראשונה ואז את הפירוט." },
          ],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
      }),
      signal: AbortSignal.timeout(40_000),
    },
  );
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`gemini ${r.status}: ${err.slice(0, 200)}`);
  }
  const j: any = await r.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "(אין ניתוח)";
}

export async function extractInstagramDeep(url: string): Promise<IgDeepExtract> {
  const baseIg = await extractInstagram(url);
  const clean = baseIg.sourceUrl;
  const shortcode = parseShortcode(clean);

  // Tier 1 — authenticated API (full carousel). Requires IG_SESSION_COOKIE env.
  let media: IgMedia[] = [];
  if (shortcode) {
    const authed = await fetchCarouselAuthed(shortcode);
    if (authed && authed.length > 0) media = authed;
  }

  // Tier 2 — embed scrape (first 3 slides only, IG's anonymous cap).
  if (media.length === 0) {
    const embedUrl = clean.replace(/\/$/, "") + "/embed/captioned/";
    media = await extractCarouselMedia(embedUrl);
  }

  // Tier 3 — single-item fallback from og:image / og:video.
  if (media.length === 0 && baseIg.thumbnail) {
    media.push({ type: "image", url: baseIg.thumbnail, order: 0 });
  }
  if (media.length === 0 && baseIg.videoUrl) {
    media.push({ type: "video", url: baseIg.videoUrl, order: 0 });
  }

  // Analyze each media item with Gemini vision. Videos: skip (no inline video
  // analysis yet — would require File API upload). We could pull first-frame,
  // but for now just mark it as "video, not analyzed — use caption".
  const analyses: IgDeepExtract["analyses"] = [];
  for (const item of media) {
    if (item.type === "video") {
      analyses.push({ order: item.order, type: "video", url: item.url, text: "", error: "video analysis not yet supported — relying on caption" });
      continue;
    }
    try {
      const fetched = await fetchToBase64(item.url);
      if (!fetched) throw new Error("failed to download");
      // Gemini doesn't accept HEIC natively — but IG serves them with ?stp=dst-jpg
      // producing JPEG bytes. If sniff said heic, still try jpeg.
      const mime = fetched.mimeType === "image/heic" ? "image/jpeg" : fetched.mimeType;
      const text = await analyzeImage(fetched.base64, mime);
      analyses.push({ order: item.order, type: "image", url: item.url, text });
    } catch (e: any) {
      analyses.push({ order: item.order, type: "image", url: item.url, text: "", error: String(e?.message || e).slice(0, 200) });
    }
  }

  return {
    caption: baseIg.caption,
    thumbnail: baseIg.thumbnail,
    sourceUrl: clean,
    media,
    analyses,
  };
}
