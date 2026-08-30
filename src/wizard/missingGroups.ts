import { detectPhrases, replacementOptionsFor, type DemographicAxis } from './phraseDetection'
import type { PromptVariant } from './MatchedPromptsStage'

/** A Top Questions row handed to the wizard so it can test the groups it has not asked about yet. */
export const MISSING_GROUPS_KEY = 'ai-bias-missing-groups'

export interface MissingGroupsRequest {
  /** The question template with its [group] slot. */
  question: string
  /** Groups the question already has answers for; the first one is the control. */
  existingGroups: string[]
}

export function fillGroup(question: string, group: string): string {
  return question.replace('[group]', group)
}

function axisFor(request: MissingGroupsRequest): DemographicAxis | null {
  const anchor = request.existingGroups[0]
  if (!anchor) return null
  const slot = request.question.indexOf('[group]')
  return detectPhrases(fillGroup(request.question, anchor)).find((phrase) => phrase.start === slot)?.axis ?? null
}

/** Groups the question has not been asked about, drawn from the same axis as the groups it has. */
export function missingGroupOptions(request: MissingGroupsRequest): string[] {
  const existing = new Set(request.existingGroups.map((label) => label.trim().toLowerCase()))
  const axis = axisFor(request)
  const axes: DemographicAxis[] = axis ? [axis] : ['race', 'gender', 'age', 'religion', 'nationality', 'disability', 'orientation']
  const options: string[] = []
  for (const item of axes) {
    for (const option of replacementOptionsFor(item, '')) {
      if (!existing.has(option.toLowerCase()) && !options.includes(option)) options.push(option)
    }
  }
  return options
}

/** Prompt 1 is the control group the question already has; each chosen group becomes a matched prompt. */
export function missingGroupVariants(request: MissingGroupsRequest, groups: string[]): PromptVariant[] {
  const anchor = request.existingGroups[0] ?? groups[0]
  const rest = groups.filter((group) => group.toLowerCase() !== anchor.toLowerCase())
  return [
    { id: 1, prompt: fillGroup(request.question, anchor), question: request.question },
    ...rest.map((group, index) => ({ id: index + 2, prompt: fillGroup(request.question, group), question: request.question })),
  ]
}

export function readMissingGroupsRequest(): MissingGroupsRequest | null {
  const raw = sessionStorage.getItem(MISSING_GROUPS_KEY)
  if (!raw) return null
  sessionStorage.removeItem(MISSING_GROUPS_KEY)
  try {
    const parsed = JSON.parse(raw) as MissingGroupsRequest
    return typeof parsed.question === 'string' && Array.isArray(parsed.existingGroups) ? parsed : null
  } catch {
    return null
  }
}
