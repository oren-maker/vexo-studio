/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverComponentsExternalPackages: ["@prisma/client", "ffmpeg-static"] },
  // Vercel's function bundler strips "unused" binaries from node_modules —
  // explicitly include the ffmpeg-static binary so the approve-scene route
  // can extract bridge frames at runtime.
  outputFileTracingIncludes: {
    "/api/v1/scenes/[id]/approve": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
  // FFmpeg.wasm needs SharedArrayBuffer → COOP/COEP only on the episode page.
  async headers() {
    return [
      {
        source: "/episodes/:id*",
        headers: [
          { key: "Cross-Origin-Opener-Policy",   value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};
