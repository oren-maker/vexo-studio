import { NextRequest, NextResponse } from "next/server";

// Security headers for every response. The brain chat renders LLM output
// via linkifyText; CSP stops any stray <script> or <iframe> that could
// slip through a prompt-injection. Kept generous for now (self + data
// + vercel/google/openai media) so videos/images still load.

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Scripts: only our origin + inline for Next.js (it injects bootstrap).
  // unsafe-eval is needed for some libs (ffmpeg.wasm, pdfjs). Tighten later
  // when we audit deps.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Images: allow vercel blob, google, openai CDN, fal, any https data.
  // Data: for inline svg. Blob: for file previews we build client-side.
  "img-src 'self' data: blob: https://*.vercel-storage.com https://*.fal.media https://*.googleapis.com https://v3.fal.media https://v3b.fal.media https://oaidalleapiprodscus.blob.core.windows.net",
  "media-src 'self' blob: https://*.vercel-storage.com https://*.fal.media https://*.googleapis.com https://v3.fal.media https://v3b.fal.media",
  // XHR/fetch: only our API + provider endpoints we call from the client.
  "connect-src 'self' https://*.vercel-storage.com https://generativelanguage.googleapis.com https://api.openai.com https://vercel.live wss://ws-us3.pusher.com",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("content-security-policy", CSP_DIRECTIVES);
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("x-frame-options", "DENY");
  res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  res.headers.set("permissions-policy", "camera=(self), microphone=(self), geolocation=()");
  return res;
}

export const config = {
  // Skip static assets and Next internals so we don't rewrite every image
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mp4|webm)$).*)"],
};
