import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/cf1-screenshots.spec.ts',
  outputDir: 'playwright-results/cf1',
  fullyParallel: false,
  workers: 1,
  use: {
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
