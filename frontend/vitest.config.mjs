import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Keep generated caches inside this worktree when node_modules is shared.
  cacheDir: '.next/cache/vitest',
  // Reuse one VM thread on Windows to avoid child-process startup stalls with
  // shared node_modules. Each test file still receives a fresh VM context.
  // One worker keeps execution sequential and limits I/O contention.
  test: process.platform === 'win32' ? {
    pool: 'vmThreads',
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    exclude: ['**/node_modules/**', 'e2e/**'],
  } : {
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
})
