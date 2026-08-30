import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PUBLIC_API_ORIGIN = 'https://ai-tests.com'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/public': {
        target: PUBLIC_API_ORIGIN,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('origin', PUBLIC_API_ORIGIN)
          })
        },
      },
    },
  },
})
