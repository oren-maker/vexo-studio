// Deep Instagram extractor — pulls caption + every carousel image + (best-effort)
// video, then runs each media item through Gemini vision so the content of the
// images/videos is available as text (not just the caption).
//
// Why: the old flow imported only the caption. Carousel posts (most text-heavy
// Instagram posts) lose all the info on the slides. This module closes that gap.

import { extractInstagram } from "./instagram";

const SCRAPER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const GEMINI_KEY = process.env.GEMINI_API_KEY?.replace(/\\n$/, "").trim();
const VISION_MODEL = "gemini-3-flash-preview";

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
    const idMatch = url.match(/\/([0-9]{15,})_/);
    if (!idMatch) continue;
    const id = idMatch[1];
    // score: "s1080x1080" → 1080, "s750x750" → 750, etc. fallback 0.
    const s = url.match(/s(\d{3,4})x\d{3,4}/)?.[1] || url.match(/p(\d{3,4})x\d{3,4}/)?.[1];
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
  const embedUrl = clean.replace(/\/$/, "") + "/embed/captioned/";

  const media = await extractCarouselMedia(embedUrl);

  // Fallback: if carousel detection found nothing, use the single og:image
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
