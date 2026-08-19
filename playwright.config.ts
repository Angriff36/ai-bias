import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  use: { baseURL: 'http://localhost:5200' },
  webServer: {
    command: 'bunx vite --port 5200 --strictPort',
    url: 'http://localhost:5200',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
