import { defineConfig, devices } from '@playwright/test'

// Real-stack E2E. Expects API on 127.0.0.1:8113 and `next start` on 127.0.0.1:3113
// (see scripts/e2e/run-e2e.sh). Never points at Staging or Production.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/parent-registration.spec.ts',
  outputDir: 'playwright-results/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:3113', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
