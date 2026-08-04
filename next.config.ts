import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        source: "/soundfonts/:path*",
        destination: "https://paulrosen.github.io/midi-js-soundfonts/:path*",
      },
    ];
  },
};

export default nextConfig;
