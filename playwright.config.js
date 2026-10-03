import { defineConfig } from '@playwright/test'

const port = Number(process.env.E2E_PORT || 5189)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL, channel: process.env.E2E_BROWSER_CHANNEL || 'msedge', headless: true, trace:'retain-on-failure' },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  },
})
