import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { SECURITY_HEADERS } from "./app/lib/securityHeaders";

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
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

// Error monitoring works at runtime without this wrapper (see instrumentation*.ts).
// The wrapper only uploads source maps so stack traces show real file names, and
// it needs a secret build token. Without SENTRY_AUTH_TOKEN the build is unchanged.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      sentryUrl: "https://de.sentry.io/",
      silent: true,
      telemetry: false,
    })
  : nextConfig;
