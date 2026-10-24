import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_PUBLIC_API_URL wird zur Build-Zeit eingebettet (Vercel Environment Variable)
  // Fallback auf localhost:8000 ist nur für lokale Entwicklung gedacht
  turbopack: {
    // Explicit root prevents workspace-root misdetection when started from a
    // parent directory (e.g. via Playwright webServer).
    root: process.cwd(),
  },
};

export default nextConfig;
