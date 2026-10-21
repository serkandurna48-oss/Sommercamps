import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Bound jsdom startup contention on shared Windows worktrees.
    maxWorkers: 2,
  },
})
