/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kmkciylrmadkhywlytkf.supabase.co",
      },
      {
        protocol: "https",
        hostname: "database.blotato.io",
      },
    ],
  },
};

export default nextConfig;
