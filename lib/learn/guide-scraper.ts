// Generic URL → guide structure scraper.
// Uses facebookexternalhit UA (per memory: SPA pages serve real HTML to scrapers).

const SCRAPER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export type ScrapedGuide = {
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  stages: Array<{ title: string; content: string; images: string[] }>;
};

import { isSafeExternalUrl } from "./url-safety";

export async function scrapeGuideFromUrl(url: string): Promise<ScrapedGuide> {
  const safe = isSafeExternalUrl(url);
  if (!safe.ok) throw new Error(`unsafe URL: ${safe.reason}`);
  const res = await fetch(safe.url.toString(), {
    headers: { "User-Agent": SCRAPER_UA, "Accept": "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const html = await res.text();

  const title =
    decodeEntities(html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)?.[1] ||
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ||
      html.match(/<h1[^>]*>([^<]*)<\/h1>/i)?.[1] ||
      "Imported guide");

  const description = decodeEntities(html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i)?.[1] ||
    html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || "") || null;

  const coverImageUrl = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i)?.[1] || null;

  // Split into stages by h2/h3 headings. Capture text between them.
  const stages: ScrapedGuide["stages"] = [];
  const headingRe = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const matches = Array.from(html.matchAll(headingRe));

  if (matches.length === 0) {
    // No headings — make one big stage from the body's main paragraphs
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
    const paragraphs = Array.from(bodyMatch.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
      .map((m) => stripHtml(decodeEntities(m[1])))
      .filter((p) => p.length > 30)
      .slice(0, 8);
    if (paragraphs.length > 0) {
      stages.push({ title, content: paragraphs.join("\n\n"), images: [] });
    }
  } else {
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const stageTitle = stripHtml(decodeEntities(m[2])).slice(0, 200);
      const startIdx = m.index! + m[0].length;
      const endIdx = i + 1 < matches.length ? matches[i + 1].index! : startIdx + 8000;
      const sectionHtml = html.slice(startIdx, endIdx);
      const paragraphs = Array.from(sectionHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
        .map((pm) => stripHtml(decodeEntities(pm[1])))
        .filter((p) => p.length > 20);
      const images = Array.from(sectionHtml.matchAll(/<img[^>]+src="([^"]+)"/gi)).map((im) => im[1]).slice(0, 4);
      const content = paragraphs.join("\n\n").slice(0, 3000);
      if (stageTitle && (content || images.length > 0)) {
        stages.push({ title: stageTitle, content, images });
      }
    }
  }

  return {
    title: title.slice(0, 200),
    description: description?.slice(0, 600) || null,
    coverImageUrl,
    stages: stages.slice(0, 12),
  };
}
