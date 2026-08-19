import { useState } from 'react'
import { TargetsPanel } from './components/ProviderConfig'
import { loadTargets, saveTargets, upsertTarget, deleteTarget, type TargetConfig } from './store/targetStore'
import { setKey, deleteKey } from './store/keyStore'

export default function App() {
  const [targets, setTargets] = useState<TargetConfig[]>(loadTargets)

  const handleSave = (target: TargetConfig, apiKey: string) => {
    if (apiKey) setKey(target.id, apiKey)
    const next = upsertTarget(targets, target)
    setTargets(next)
    saveTargets(next)
  }

  const handleDelete = (id: string) => {
    deleteKey(id)
    const next = deleteTarget(targets, id)
    setTargets(next)
    saveTargets(next)
  }

  return (
    <div className="app">
      <h1>ParityLab — AI Targets</h1>
      <TargetsPanel targets={targets} onSave={handleSave} onDelete={handleDelete} />
    </div>
  )
}
