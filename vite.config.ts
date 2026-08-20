import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { subscriptionBridgePlugin } from './server/subscriptions/vite-plugin'

export default defineConfig({
  plugins: [subscriptionBridgePlugin(), react()],
})
