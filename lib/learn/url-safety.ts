// SSRF protection: validate that a user-provided URL is safe to fetch server-side.
// Blocks localhost, private IP ranges, link-local, and cloud metadata endpoints.

export function isSafeExternalUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, reason: `blocked protocol: ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase();

  // Block metadata endpoints (AWS, GCP, Azure, Alibaba)
  if (host === "169.254.169.254" || host === "metadata.google.internal" || host === "100.100.100.200") {
    return { ok: false, reason: "metadata endpoint blocked" };
  }

  // Block localhost / loopback
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost")
  ) {
    return { ok: false, reason: "localhost blocked" };
  }

  // Block private IPv4 ranges (10.x, 172.16-31.x, 192.168.x)
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return { ok: false, reason: "private 10.0.0.0/8 blocked" };
    if (a === 172 && b >= 16 && b <= 31) return { ok: false, reason: "private 172.16.0.0/12 blocked" };
    if (a === 192 && b === 168) return { ok: false, reason: "private 192.168.0.0/16 blocked" };
    if (a === 169 && b === 254) return { ok: false, reason: "link-local blocked" };
    if (a === 127) return { ok: false, reason: "loopback blocked" };
  }

  // Block IPv6 ULA (fc00::/7) and link-local (fe80::/10)
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:") || host.startsWith("[fc") || host.startsWith("[fd") || host.startsWith("[fe80:")) {
    return { ok: false, reason: "IPv6 private/link-local blocked" };
  }

  return { ok: true, url };
}
