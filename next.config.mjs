/** @type {import('next').NextConfig} */
const nextConfig = {
  // Font-/Wappen-Assets für das Post-Rendering (render-post.tsx) müssen mit in
  // die Serverless-Bundles — sonst fehlen sie zur Laufzeit auf Vercel.
  experimental: {
    outputFileTracingIncludes: {
      "/api/**": ["./src/assets/**"],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kmkciylrmadkhywlytkf.supabase.co",
      },
      {
        protocol: "https",
        hostname: "tjcpyzzexfulxwhykiap.supabase.co",
      },
      {
        protocol: "https",
        hostname: "database.blotato.io",
      },
    ],
  },
  // Zentrale Sicherheits-Header. Bewusst OHNE strikte Content-Security-Policy
  // vor der Vorstellung (Next-Inline-Styles/-Skripte würden sonst brechen);
  // Clickjacking-, MIME- und Referrer-Schutz greifen aber sofort.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
