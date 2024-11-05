/** @type {import('next').NextConfig} */

import { build } from "esbuild";

const nextConfig = {
  webpack: (config, { isServer }) => {
    // Only build the service worker on client-side builds
    if (!isServer) {
      buildServiceWorker().catch((err) => {
        console.error("Failed to build service worker:", err);
        process.exit(1);
      });
    }
    return config;
  },
};

// Service worker build function
async function buildServiceWorker() {
  try {
    const result = await build({
      entryPoints: ["src/workers/upload/worker.ts"],
      bundle: true,
      minify: true,
      format: "esm",
      platform: "browser",
      target: "es2020",
      outfile: "public/upload.worker.js",
      write: true,
      // Define any external packages that should be included
      external: [],
      // Define any replacements for development/production
      define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
      },
      // Ensure source maps are generated for debugging
      sourcemap: process.env.NODE_ENV === "development",
      // Add any necessary plugins
      plugins: [],
    });

    console.log("Service worker built successfully");
    return result;
  } catch (error) {
    console.error("Error building service worker:", error);
    throw error;
  }
}

export default nextConfig;
