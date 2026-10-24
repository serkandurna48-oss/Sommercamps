import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'cx15-admin-mobile.spec.ts',
  outputDir: '../.qa-cx15/playwright',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: { baseURL: 'http://localhost:3105', reducedMotion: 'reduce' },
  webServer: {
    command: 'npm.cmd run dev --prefix frontend -- --webpack --port 3105',
    url: 'http://localhost:3105',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
