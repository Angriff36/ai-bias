import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 2000,
    retry: 0,
    reporters: ['verbose'],
  },
})
