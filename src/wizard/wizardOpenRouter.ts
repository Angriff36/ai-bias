import { getOpenRouterSession } from '../openrouter/oauth'
import { loadTargets, saveTargets, upsertTarget } from '../store/targetStore'

export class WizardOpenRouterTarget {
  static add(modelId: string): boolean {
    if (!getOpenRouterSession()) return false
    const normalized = modelId.trim()
    if (!normalized) return false
    return saveTargets(upsertTarget(loadTargets(), {
      id: `openrouter-oauth:${normalized}`,
      name: normalized,
      provider: 'openrouter',
      modelId: normalized,
      authMode: 'openrouter-oauth',
    }))
  }
}
