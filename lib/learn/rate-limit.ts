// Simple in-memory sliding-window rate limiter.
// On Vercel serverless, each instance has its own memory so limits are per-instance.
// For strict global limits, swap to Upstash Redis.

type Bucket = { windowStart: number; count: number };
const store = new Map<string, Bucket>();

const CLEAN_EVERY = 1000;
let opCount = 0;

function cleanup(now: number) {
  opCount++;
  if (opCount % CLEAN_EVERY !== 0) return;
  store.forEach((v, k) => {
    if (now - v.windowStart > 3600_000) store.delete(k);
  });
}

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  cleanup(now);
  const b = store.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    store.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: limit - 1, resetMs: windowMs };
  }
  if (b.count >= limit) {
    return { allowed: false, remaining: 0, resetMs: windowMs - (now - b.windowStart) };
  }
  b.count++;
  return { allowed: true, remaining: limit - b.count, resetMs: windowMs - (now - b.windowStart) };
}

export function getClientKey(req: Request): string {
  // On Vercel, trust only the Vercel-set headers. x-forwarded-for can be spoofed
  // by clients setting their own header; the last entry in the list is the one
  // Vercel's edge added. Prefer x-real-ip which Vercel controls.
  const vercelIp = req.headers.get("x-real-ip");
  if (vercelIp) return vercelIp;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    // Take the LAST entry (closest to our server = Vercel's edge)
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "anon";
}
