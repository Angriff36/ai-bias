import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 2000,
    retry: 0,
    reporters: ['verbose'],
  },
})
