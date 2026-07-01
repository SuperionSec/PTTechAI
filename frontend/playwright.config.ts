import { defineConfig } from '@playwright/test'

// E2E config for page-level testing against the live Docker stack.
// Frontend served on 3100, backend on 8100 (see deploy/docker-compose.e2e.yml).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.PTTECH_E2E_WEB || 'http://127.0.0.1:3100',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
})
