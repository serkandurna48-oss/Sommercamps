import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3099',
  },
  webServer: {
    command: 'powershell -NoProfile -Command "Set-Location frontend; $env:NEXT_PRIVATE_DISABLE_TURBOPACK=\'1\'; npm run dev -- --port 3099"',
    url: 'http://localhost:3099',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  reporter: 'list',
})
