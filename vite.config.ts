import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { subscriptionBridgePlugin } from './server/subscriptions/vite-plugin'
import { apiPlugin } from './server/vite-plugin'

export default defineConfig({
  plugins: [apiPlugin(), subscriptionBridgePlugin(), react()],
})
