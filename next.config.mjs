/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverComponentsExternalPackages: ["@prisma/client"] },
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
