import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Keep generated caches inside this worktree when node_modules is shared.
  cacheDir: '.next/cache/vitest',
  // On Windows: use pool 'vmForks'. Workers have canReuse()=true, so the single
  // fork process is created ONCE and shared across all 52 test files. Each file
  // still executes in a fresh Node.js vm.Context (fresh module registry, vi.mock
  // per file), but there is no repeated fork startup. This eliminates the
  // "Timeout waiting for worker to respond" errors that occurred because each new
  // fork took ~8.7 s to load shared node_modules and the 60 s START_TIMEOUT was
  // hit under accumulated memory pressure. vitest sets isolate: false for vmForks
  // automatically; isolation is provided by the VM context, not module re-eval.
  // maxWorkers: 1 keeps tests sequential so the single shared fork is not
  // overwhelmed; it also prevents I/O contention on the shared node_modules tree.
  test: process.platform === 'win32' ? {
    pool: 'vmForks',
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    exclude: ['**/node_modules/**', 'e2e/**'],
  } : {
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
})
