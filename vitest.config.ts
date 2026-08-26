import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'server/**/*.test.ts', 'worker/**/*.test.ts'],
    // Node by default; component tests opt into a browser-like DOM per file
    // with the `@vitest-environment jsdom` docblock.
    environment: 'node',
    globals: true,
    testTimeout: 5000,
    retry: 0,
    reporters: ['verbose'],
  },
})
