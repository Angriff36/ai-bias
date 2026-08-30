import type { Ref } from 'react'
import type { SamplingMode } from '../engine/samplingMode'
import { detectPhrases, replacementOptionsFor, type DetectedPhrase } from './phraseDetection'
import { AxisBadge, InteractivePrompt } from './interactivePrompt'

export interface PromptVariant {
  id: number
  prompt: string
  pairId?: string
  question?: string
  labelA?: string
  labelB?: string
}

export function MatchedPromptsStage({
  mode,
  variants,
  sourcePrompt,
  detectFailed,
  createError,
  name,
  nameError,
  description,
  showDescription,
  samplingMode,
  creating,
  promptsReady,
  headingRef,
  activePhrase,
  onBack,
  onDetect,
  onUpdatePrompt,
  onApplyReplacement,
  onAddPrompt,
  onRemovePrompt,
  onActivePhrase,
  onSamplingMode,
  onName,
  onNameBlur,
  onShowDescription,
  onDescription,
  onClose,
  onCreate,
}: {
  mode: 'create' | 'edit'
  variants: PromptVariant[]
  sourcePrompt: string
  detectFailed: boolean
  createError: string | null
  name: string
  nameError: string | null
  description: string
  showDescription: boolean
  samplingMode: SamplingMode
  creating: boolean
  promptsReady: boolean
  headingRef: Ref<HTMLHeadingElement>
  activePhrase: { promptId: number; phrase: DetectedPhrase } | null
  onBack: () => void
  onDetect: () => void
  onUpdatePrompt: (promptId: number, value: string) => void
  onApplyReplacement: (promptId: number, phrase: DetectedPhrase, replacement: string) => void
  onAddPrompt: () => void
  onRemovePrompt: (promptId: number) => void
  onActivePhrase: (value: { promptId: number; phrase: DetectedPhrase } | null) => void
  onSamplingMode: (value: SamplingMode) => void
  onName: (value: string) => void
  onNameBlur: () => void
  onShowDescription: () => void
  onDescription: (value: string) => void
  onClose: () => void
  onCreate: () => void
}) {
  return (
    <section className="wz-stage wz-stage-match" aria-labelledby="wz-match-title">
      <header className="wz-stage-header">
        <p className="wz-stage-eyebrow">{mode === 'edit' ? 'EDIT EXPERIMENT / MATCHED PROMPTS' : 'NEW EXPERIMENT / MATCHED PROMPTS'}</p>
        <h2 id="wz-match-title" ref={headingRef} tabIndex={-1}>Create matched prompts</h2>
        <p>Prompt 2 starts as an exact copy. Click any highlighted variable to replace it, or edit any prompt directly.</p>
      </header>

      {mode === 'create' && (
        <div className="wz-match-nav">
          <button type="button" className="link" onClick={onBack}>Back to test prompt</button>
          <button type="button" className="link" onClick={onDetect}>Reset matched prompts</button>
        </div>
      )}

      {detectFailed && (
        <div className="banner error" role="alert">
          Phrase detection failed. You can still edit every prompt directly.
          <button type="button" className="secondary" onClick={onDetect}>Try again</button>
        </div>
      )}
      {createError && (
        <div className="banner error" role="alert">
          {createError}
          <button type="button" className="secondary" onClick={onCreate}>Retry</button>
        </div>
      )}

      <div className="wz-prompt-list" aria-label="Experiment prompts">
        {variants.map((variant, index) => (
          <PromptVariantCard
            key={variant.id}
            variant={variant}
            index={index}
            sourcePrompt={sourcePrompt}
            selectedPhrase={activePhrase?.promptId === variant.id ? activePhrase.phrase : null}
            onUpdatePrompt={onUpdatePrompt}
            onApplyReplacement={onApplyReplacement}
            onRemovePrompt={onRemovePrompt}
            onSelectPhrase={(phrase) => onActivePhrase({ promptId: variant.id, phrase })}
          />
        ))}
        <button type="button" className="secondary wz-add-prompt" aria-label="Add another prompt" onClick={onAddPrompt}>
          + Add another prompt
        </button>
      </div>

      <section className="wz-experiment-details" aria-labelledby="wz-details-title">
        <div className="wz-details-heading">
          <p id="wz-details-title" className="wz-section-label">Experiment details</p>
          <span>Used to identify this study in your research archive.</span>
        </div>

        <fieldset className="wz-sampling-mode" aria-labelledby="wz-sampling-title">
          <legend id="wz-sampling-title">Sampling</legend>
          <label className="wz-radio-option">
            <input type="radio" name="sampling-mode" checked={samplingMode === 'independent-pairs'} onChange={() => onSamplingMode('independent-pairs')} />
            <span>
              <strong>Independent pairs — recommended</strong>
              <small>Ask both the reference and the comparison prompt for every question. Every question gets its own two sides. Higher cost, usable evidence.</small>
            </span>
          </label>
          <label className="wz-radio-option">
            <input type="radio" name="sampling-mode" checked={samplingMode === 'shared-anchor'} onChange={() => onSamplingMode('shared-anchor')} />
            <span>
              <strong>Shared anchor — same-scenario prompts only</strong>
              <small>Ask the first prompt once and reuse its answer as the reference side for every question. Only valid when every prompt tests the same scenario; for different questions the other sides will show as unanswered.</small>
            </span>
          </label>
        </fieldset>

        <label htmlFor="wz-name" className="wz-label">Experiment name</label>
        <input
          id="wz-name"
          className="wz-input"
          maxLength={80}
          value={name}
          aria-describedby={nameError ? 'wz-name-err wz-name-count' : 'wz-name-count'}
          onChange={(event) => onName(event.target.value)}
          onBlur={onNameBlur}
        />
        <div className="wz-row-between">
          {nameError ? <span id="wz-name-err" className="wz-warn" role="status">{nameError}</span> : <span />}
          <span id="wz-name-count" className="wz-muted">{name.length}/80</span>
        </div>

        {!showDescription ? (
          <button type="button" className="link" onClick={onShowDescription}>Add description (optional)</button>
        ) : (
          <>
            <label htmlFor="wz-desc" className="wz-label">Description</label>
            <textarea id="wz-desc" className="wz-textarea small" value={description} onChange={(event) => onDescription(event.target.value)} />
          </>
        )}
      </section>

      <div className="wz-create-actions">
        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="primary wz-create" onClick={onCreate} disabled={creating || !promptsReady}>
          {creating ? (mode === 'edit' ? 'Saving…' : 'Creating…') : (mode === 'edit' ? 'Save changes' : 'Create Experiment')}
        </button>
      </div>
    </section>
  )
}

function PromptVariantCard({
  variant, index, sourcePrompt, selectedPhrase,
  onUpdatePrompt, onApplyReplacement, onRemovePrompt, onSelectPhrase,
}: {
  variant: PromptVariant
  index: number
  sourcePrompt: string
  selectedPhrase: DetectedPhrase | null
  onUpdatePrompt: (promptId: number, value: string) => void
  onApplyReplacement: (promptId: number, phrase: DetectedPhrase, replacement: string) => void
  onRemovePrompt: (promptId: number) => void
  onSelectPhrase: (phrase: DetectedPhrase) => void
}) {
  let detected: DetectedPhrase[] = []
  try { detected = detectPhrases(variant.prompt) } catch { /* direct editing remains available */ }
  const promptNumber = index + 1
  const isOriginal = index === 0
  const isReady = isOriginal || (variant.prompt.trim().length > 0 && variant.prompt.trim() !== sourcePrompt.trim())

  return (
    <section className="wz-prompt-variant" aria-label={`Prompt ${promptNumber}`}>
      <div className="wz-prompt-variant-heading">
        <div>
          <p className="wz-section-label">PROMPT {promptNumber}{isOriginal ? ' — ORIGINAL' : ' — MATCHED'}</p>
          <span>{detected.length ? 'Click highlighted text for replacements.' : 'Edit the prompt directly.'}</span>
        </div>
        <div className="wz-prompt-variant-actions">
          {!isOriginal && (
            <span className={isReady ? 'wz-match-ready ready' : 'wz-match-ready'}>
              {isReady ? 'Ready' : 'Make one change'}
            </span>
          )}
          {index > 1 && (
            <button type="button" className="link danger" aria-label={`Remove Prompt ${promptNumber}`} onClick={() => onRemovePrompt(variant.id)}>
              Remove
            </button>
          )}
        </div>
      </div>

      <InteractivePrompt
        prompt={variant.prompt}
        phrases={detected}
        ariaLabel={`Prompt ${promptNumber} highlighted preview`}
        activePhraseId={selectedPhrase?.id ?? null}
        onPhrase={onSelectPhrase}
      />

      {selectedPhrase && (
        <div className="wz-replacement-picker" role="group" aria-label={`Replacement options for Prompt ${promptNumber}: ${selectedPhrase.text}`}>
          <div className="wz-replacement-heading">
            <span>Replace <strong>{selectedPhrase.text}</strong> with</span>
            <AxisBadge axis={selectedPhrase.axis} />
          </div>
          <div className="wz-replacement-options">
            {replacementOptionsFor(selectedPhrase.axis, selectedPhrase.text).map((option) => (
              <button
                key={option}
                type="button"
                className="wz-replacement-option"
                aria-label={`Replace ${selectedPhrase.text} with ${option}`}
                onClick={() => onApplyReplacement(variant.id, selectedPhrase, option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="wz-edit-prompt-label" htmlFor={`wz-prompt-${variant.id}`}>Edit Prompt {promptNumber}</label>
      <textarea
        id={`wz-prompt-${variant.id}`}
        className="wz-matched-textarea"
        aria-label={`Edit Prompt ${promptNumber}`}
        value={variant.prompt}
        onChange={(event) => onUpdatePrompt(variant.id, event.target.value)}
      />
    </section>
  )
}
