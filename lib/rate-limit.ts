// Per-IP sliding-window rate limiter. In-memory Map, good enough for
// single-instance Vercel serverless functions (each Lambda gets its own
// process; aggregate-across-instances would need Redis). Catches the
// common case: a misbehaving client looping /learn/brain/chat.

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

// Clean old buckets on every call — cheap O(N) walk with N ≤ a few hundred
// since we purge aggressively. Runs inline so no background interval needed
// (serverless = no persistent timers anyway).
function purge(now: number, windowMs: number) {
  if (buckets.size < 50) return;
  for (const [key, b] of buckets) {
    if (now - b.windowStart > windowMs * 2) buckets.delete(key);
  }
}

export function rateLimit(key: string, opts?: { max?: number; windowMs?: number }): { ok: boolean; retryAfterMs: number; remaining: number } {
  const max = opts?.max ?? 30;
  const windowMs = opts?.windowMs ?? 60_000;
  const now = Date.now();
  purge(now, windowMs);

  const b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, retryAfterMs: 0, remaining: max - 1 };
  }
  if (b.count >= max) {
    return { ok: false, retryAfterMs: windowMs - (now - b.windowStart), remaining: 0 };
  }
  b.count++;
  return { ok: true, retryAfterMs: 0, remaining: max - b.count };
}

export function ipKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
