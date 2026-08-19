import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  use: { baseURL: 'http://localhost:5199' },
  webServer: {
    command: 'bunx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
