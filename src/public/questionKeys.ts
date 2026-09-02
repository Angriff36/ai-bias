export function normalizeQuestionKey(question: string | undefined): string {
  if (!question?.trim()) return '__missing_question__'
  return question.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function questionLeaderboardHref(questionKey: string): string {
  return `#/leaderboard/questions/${encodeURIComponent(questionKey)}`
}

/** Deep link to one stored answer on a question page. The id is the stable evidence id. */
export function questionAnswerHref(questionKey: string, answerId: string): string {
  return `${questionLeaderboardHref(questionKey)}/answers/${encodeURIComponent(answerId)}`
}
