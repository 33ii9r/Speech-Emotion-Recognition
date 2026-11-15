import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 20000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '../verification/browser-results.json' }]],
  outputDir: '../verification/browser-artifacts',
  use: { baseURL: 'http://127.0.0.1:8000', channel: 'msedge', headless: true,
    viewport: { width: 1672, height: 941 }, screenshot: 'only-on-failure', trace: 'off' },
})
