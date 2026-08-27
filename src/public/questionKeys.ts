export function normalizeQuestionKey(question: string | undefined): string {
  if (!question?.trim()) return '__missing_question__'
  return question.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function questionLeaderboardHref(questionKey: string): string {
  return `#/leaderboard/questions/${encodeURIComponent(questionKey)}`
}
