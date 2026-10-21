import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Keep generated caches inside this worktree when node_modules is shared.
  cacheDir: '.next/cache/vitest',
  // Avoid worker-start timeouts in constrained Windows worktrees. Keep the
  // complete SSR/jsdom trees and assertions instead of replacing UI with mocks.
  test: process.platform === 'win32' ? { maxWorkers: 1, testTimeout: 30_000, hookTimeout: 30_000 } : {},
})
