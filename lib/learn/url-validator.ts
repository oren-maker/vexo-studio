// For Vercel deployment, we accept direct MP4/webm URLs that the server can fetch.
// YouTube/Vimeo require yt-dlp extraction and are not supported in serverless.
// Allowed: Pexels/Pixabay direct CDN links, Vercel Blob storage, other public MP4.

const DIRECT_ALLOWED_HOSTS = [
  "videos.pexels.com",
  "cdn.pixabay.com",
  "public.blob.vercel-storage.com",
];

const BLOCKED_WITH_HINT: Array<{ match: RegExp; hint: string }> = [
  { match: /youtube\.com|youtu\.be/i, hint: "YouTube URLs לא נתמכים. העלה את הסרטון ידנית או השתמש בחיפוש Pexels." },
  { match: /vimeo\.com/i, hint: "Vimeo URLs לא נתמכים. העלה את הסרטון ידנית או השתמש בחיפוש Pexels." },
  { match: /instagram\.com/i, hint: "Instagram יש לשלוח דרך הטאב \"📸 Instagram\" בדף הוספת מקור — שם יש פייפליין מלא: הורדה → תרגום → Gemini." },
  { match: /tiktok\.com/i, hint: "TikTok עדיין לא נתמך. העלה את הקובץ ידנית." },
];

export function validateUrl(url: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "כתובת URL לא חוקית" };
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    return { ok: false, reason: "רק HTTP/HTTPS נתמכים" };

  const host = parsed.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    host.startsWith("169.254.") ||
    host === "::1"
  ) {
    return { ok: false, reason: "כתובות פנימיות חסומות" };
  }

  for (const b of BLOCKED_WITH_HINT) {
    if (b.match.test(host)) return { ok: false, reason: b.hint };
  }

  // Accept specific direct-video hosts
  const allowed = DIRECT_ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h));
  if (allowed) return { ok: true };

  // Accept any URL ending in a video extension (generic CDN MP4)
  if (/\.(mp4|webm|mov)(\?|$)/i.test(parsed.pathname + parsed.search)) return { ok: true };

  return {
    ok: false,
    reason: `מארח לא מאושר (${host}). מותר: Pexels, Pixabay, Vercel Blob, או URL ישיר ל-MP4/webm`,
  };
}
