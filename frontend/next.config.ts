import type { NextConfig } from "next";
import { existsSync } from "fs";
import { resolve, dirname } from "path";

// In a git-worktree setup node_modules may live several levels above frontend/
// (e.g. wt/node_modules). Turbopack needs to know the directory that contains
// node_modules so it can resolve the Next.js package itself.
function findTurbopackRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, "node_modules", "next"))) return dir;
    dir = dirname(dir);
  }
  return startDir;
}

const nextConfig: NextConfig = {
  // NEXT_PUBLIC_API_URL wird zur Build-Zeit eingebettet (Vercel Environment Variable)
  // Fallback auf localhost:8000 ist nur für lokale Entwicklung gedacht
  turbopack: {
    root: findTurbopackRoot(process.cwd()),
  },
};

export default nextConfig;
