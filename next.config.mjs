/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverComponentsExternalPackages: ["@prisma/client", "@ffmpeg-installer/ffmpeg"] },
  // Vercel's function bundler strips "unused" binaries from node_modules —
  // explicitly include the ffmpeg binary for the approve-scene route.
  // @ffmpeg-installer ships per-platform binaries; include all so the
  // Linux one lands in the Lambda.
  outputFileTracingIncludes: {
    "/api/v1/scenes/[id]/approve": [
      "./node_modules/@ffmpeg-installer/**/*",
    ],
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
