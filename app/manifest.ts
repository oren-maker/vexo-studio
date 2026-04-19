import type { MetadataRoute } from "next";

// Native Next.js PWA manifest. Installable to phone home screen so Oren can
// reach the brain chat without the browser chrome. Keeps things minimal —
// no service worker yet; offline can be Phase 2 when needed.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "vexo studio",
    short_name: "vexo",
    description: "AI director for serial video production",
    start_url: "/learn/brain/chat",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    orientation: "portrait",
    lang: "he",
    dir: "rtl",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
  };
}
