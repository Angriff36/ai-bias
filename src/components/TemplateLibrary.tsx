import { useState } from 'react'
import type { PromptTemplate } from '../types'
import { useTemplateLibrary } from '../store'
import { TemplateCard } from './TemplateCard'
import { InstantiateModal } from './InstantiateModal'
import { EditTemplateDialog } from './EditTemplateDialog'
import { SkeletonGrid } from './SkeletonGrid'

/**
 * Prompt template library.
 *
 * A template holds a prompt with {{placeholders}}. Filling them produces one
 * finished prompt, which is exactly what the new-experiment wizard starts from,
 * so "Use in an experiment" hands the prompt to that wizard.
 */
export function TemplateLibrary({ onUsePrompt }: { onUsePrompt: (prompt: string, name: string) => void }) {
  const library = useTemplateLibrary()
  const [instantiating, setInstantiating] = useState<PromptTemplate | null>(null)
  const [editing, setEditing] = useState<PromptTemplate | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const handleSubmit = async (
    kind: 'experiment' | 'template',
    payload: { prompt: string; values: Record<string, string>; name: string },
  ) => {
    if (kind === 'experiment') {
      setInstantiating(null)
      onUsePrompt(payload.prompt, payload.name)
      return
    }
    library.addTemplate({
      id: `tpl-${Date.now()}`,
      name: payload.name,
      description: 'Saved from a filled template.',
      body: payload.prompt,
      variables: [],
      seeded: false,
      createdAt: new Date().toISOString(),
    })
    setInstantiating(null)
    setNotice(`Saved "${payload.name}" to your templates.`)
  }

  return (
    <section className="template-library" aria-labelledby="templates-title">
      <header className="providers-page-header">
        <div>
          <p className="eyebrow">Prompt library</p>
          <h2 id="templates-title">Templates</h2>
          <p className="muted">
            Fill in a template's placeholders to produce a prompt, then send it straight to the
            new-experiment wizard, which finds the demographic phrases to compare.
          </p>
        </div>
      </header>

      {notice && <div className="banner success" role="status">{notice}</div>}

      <h3 className="wz-summary-h">Your templates</h3>
      {library.userTemplatesLoading ? (
        <SkeletonGrid />
      ) : library.userTemplates.length === 0 ? (
        <p className="muted">None yet. Duplicate a starter template below to make one you can edit.</p>
      ) : (
        <div className="template-grid">
          {library.userTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onOpen={() => setInstantiating(template)}
              onDuplicate={() => library.duplicateTemplate(template)}
            />
          ))}
        </div>
      )}

      <h3 className="wz-summary-h">Starter templates</h3>
      <div className="template-grid">
        {library.seedTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onOpen={() => setInstantiating(template)}
            onDuplicate={() => library.duplicateTemplate(template)}
          />
        ))}
      </div>

      {instantiating && (
        <InstantiateModal
          template={instantiating}
          onClose={() => setInstantiating(null)}
          onSubmit={handleSubmit}
        />
      )}

      {editing && (
        <EditTemplateDialog
          template={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => { library.updateTemplate(editing.id, patch); setEditing(null) }}
        />
      )}
    </section>
  )
}
