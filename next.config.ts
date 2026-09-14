import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The forest has no server-side data or API routes. Export the complete page
  // and client assets for S3/CloudFront while preserving the original scene.
  output: "export",
};

export default nextConfig;
