import type { PublicEvidenceItem, PublicLeaderboard, PublicQuestionSummary } from './contracts'
import { normalizeQuestionKey } from './questionKeys'
import { PromptTopicClassifier, type PromptTopicId } from './submittedPromptTopics'

export type PromptRowStatus = 'complete' | 'pending'
export type PromptFeedSort = 'newest' | 'most-tested'
export type PromptFeedSource = 'evidence' | 'questions'
export const PROMPT_PAGE_SIZES = [20, 50, 100] as const
export type PromptPageSize = (typeof PROMPT_PAGE_SIZES)[number]
export const DEFAULT_PROMPT_PAGE_SIZE: PromptPageSize = 50

export class PromptPageWindow {
  static take<T>(rows: T[], size: PromptPageSize): T[] {
    return rows.slice(0, size)
  }
}

export interface SubmittedPromptRowModel {
  id: string
  prompt: string
  groupedQuestion: string | null
  questionKey: string
  topic: PromptTopicId
  status: PromptRowStatus
  modelLabel: string
  testCount: number
  receivedAt: string
}

export interface SubmittedPromptFeed {
  rows: SubmittedPromptRowModel[]
  source: PromptFeedSource
  shown: number
  total: number
}

export interface SubmittedPromptStats {
  promptsSubmitted: number
  groupedQuestions: number
  matchedTests: number
  modelsCompared: number
}

const PLACEHOLDER_QUESTION = /^prompt\s+\d+\s+vs\s+prompt\s+\d+$/i

function isRealQuestion(value: string | undefined): value is string {
  const text = value?.trim() ?? ''
  return text.length > 0 && !PLACEHOLDER_QUESTION.test(text)
}

function shortModelLabel(modelId: string): string {
  const leaf = modelId.split('/').pop()?.trim()
  return leaf || modelId
}

function normalizePrompt(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export class SubmittedPromptFeedBuilder {
  constructor(private readonly topics = new PromptTopicClassifier()) {}

  stats(data: PublicLeaderboard): SubmittedPromptStats {
    return {
      promptsSubmitted: data.totals.responses,
      groupedQuestions: data.totals.questions,
      matchedTests: data.totals.completePairs,
      modelsCompared: data.totals.models,
    }
  }

  build(data: PublicLeaderboard): SubmittedPromptFeed {
    const fromEvidence = this.fromEvidence(data)
    if (fromEvidence.rows.length > 0) return fromEvidence
    return this.fromQuestions(data)
  }

  page(rows: SubmittedPromptRowModel[], size: PromptPageSize): SubmittedPromptRowModel[] {
    return PromptPageWindow.take(rows, size)
  }

  filter(rows: SubmittedPromptRowModel[], topic: PromptTopicId | 'all', sort: PromptFeedSort): SubmittedPromptRowModel[] {
    const filtered = topic === 'all' ? rows : rows.filter((row) => row.topic === topic)
    const ranked = [...filtered]
    ranked.sort((left, right) => {
      if (sort === 'most-tested' && left.testCount !== right.testCount) return right.testCount - left.testCount
      return right.receivedAt.localeCompare(left.receivedAt)
    })
    return ranked
  }

  private fromEvidence(data: PublicLeaderboard): SubmittedPromptFeed {
    const seen = new Set<string>()
    const rows: SubmittedPromptRowModel[] = []
    for (const item of data.recentEvidence) {
      const prompt = normalizePrompt(item.prompt)
      if (!prompt || seen.has(prompt.toLowerCase())) continue
      seen.add(prompt.toLowerCase())
      rows.push(this.rowFromEvidence(item, prompt, data.topQuestions))
    }
    return { rows, source: 'evidence', shown: rows.length, total: data.totals.responses }
  }

  private fromQuestions(data: PublicLeaderboard): SubmittedPromptFeed {
    const rows = data.topQuestions.map((question) => this.rowFromQuestion(question))
    return { rows, source: 'questions', shown: rows.length, total: data.totals.questions }
  }

  private rowFromEvidence(item: PublicEvidenceItem, prompt: string, questions: PublicQuestionSummary[]): SubmittedPromptRowModel {
    const questionText = isRealQuestion(item.question) ? item.question.trim() : null
    const questionKey = normalizeQuestionKey(questionText ?? prompt)
    const grouped = questions.find((question) => (
      question.questionKey === questionKey || normalizeQuestionKey(question.questionText) === questionKey
    ))
    const groupedQuestion = grouped?.questionText ?? questionText
    const testCount = grouped?.runCount ?? 0
    return {
      id: item.id,
      prompt,
      groupedQuestion: groupedQuestion && groupedQuestion !== prompt ? groupedQuestion : null,
      questionKey,
      topic: this.topics.classify(`${prompt} ${groupedQuestion ?? ''}`),
      status: testCount > 0 ? 'complete' : 'pending',
      modelLabel: shortModelLabel(item.modelId),
      testCount,
      receivedAt: item.receivedAt,
    }
  }

  private rowFromQuestion(question: PublicQuestionSummary): SubmittedPromptRowModel {
    return {
      id: question.questionKey,
      prompt: question.questionText,
      groupedQuestion: null,
      questionKey: question.questionKey,
      topic: this.topics.classify(question.questionText),
      status: question.runCount > 0 ? 'complete' : 'pending',
      modelLabel: `${question.modelCount.toLocaleString()} ${question.modelCount === 1 ? 'model' : 'models'}`,
      testCount: question.runCount,
      receivedAt: question.lastSeenAt,
    }
  }
}
