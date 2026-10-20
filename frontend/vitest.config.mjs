import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Avoid worker-start timeouts in constrained Windows worktrees. Keep the
  // complete SSR/jsdom trees and assertions instead of replacing UI with mocks.
  test: process.platform === 'win32' ? { maxWorkers: 1, testTimeout: 30_000 } : {},
})
