import type { Plugin } from 'vite'
import { createSubscriptionMiddleware } from './http'
import { SubscriptionProviderRegistry } from './providers'

export function subscriptionBridgePlugin(): Plugin {
  const middleware = createSubscriptionMiddleware(new SubscriptionProviderRegistry())
  return {
    name: 'ai-bias-subscription-bridge',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
