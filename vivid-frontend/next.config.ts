import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack root to this project. Otherwise Next walks up the tree
  // looking for a lockfile and can settle on a directory above the repo, which
  // makes it watch far more of the filesystem than it needs to.
  turbopack: {
    root: import.meta.dirname,
  },
  experimental: {
    // Import only the referenced members of these barrel packages rather than
    // the whole module graph.
    optimizePackageImports: ["@tanstack/react-query", "sonner", "tailwind-merge"],
  },
};

export default nextConfig;
