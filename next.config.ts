import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
      },
      {
        protocol: 'https',
        hostname: 'api.thefactory23.com',
      },
      {
        protocol: 'https',
        hostname: 'factory23-storage.lon1.cdn.digitaloceanspaces.com',
      },
      {
        protocol: 'https',
        hostname: 'factory23-storage.lon1.digitaloceanspaces.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/dashboard/projects',
        destination: '/projects',
        permanent: false,
      },
      {
        source: '/dashboard/projects/:path*',
        destination: '/projects/:path*',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
