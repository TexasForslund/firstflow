import type { Question } from '../../api/forms'
import type { AnswerValue } from '../../api/reports'

export type Answers = Record<string, AnswerValue>

/** Om svaret räknas som besvarat. Samma regel som i backend: tomt = obesvarat. */
export function isAnswered(question: Question, answer: AnswerValue | undefined): boolean {
  if (!answer) return false
  switch (question.type) {
    case 'short_text':
    case 'long_text':
      return !!answer.text?.trim()
    case 'choice':
      return (answer.choice_ids?.length ?? 0) > 0 || !!answer.other_text?.trim()
    case 'yes_no':
      return answer.boolean !== null && answer.boolean !== undefined
    case 'rating':
      return !!answer.rating
    case 'statement':
      return true
  }
}

export function isRequired(question: Question): boolean {
  return question.type !== 'statement' && question.required
}

function answerKeys(question: Question, answer: AnswerValue): string[] {
  switch (question.type) {
    case 'choice':
      return answer.choice_ids ?? []
    case 'yes_no':
      return answer.boolean === null || answer.boolean === undefined ? [] : [answer.boolean ? 'yes' : 'no']
    case 'rating':
      return answer.rating ? [String(answer.rating)] : []
    default:
      return []
  }
}

/**
 * Frågorna eleven får, i ordning, med hänsyn till logiken. Räknas likadant som
 * visible_path i backend, så att förhandsgranskningen och elevens vy stämmer.
 */
export function visiblePath(questions: Question[], answers: Answers): string[] {
  const position = new Map(questions.map((q, i) => [q.id, i]))
  const path: string[] = []
  let i = 0
  while (i < questions.length) {
    const question = questions[i]
    path.push(question.id)
    let next = i + 1
    const answer = answers[question.id]
    if (answer && 'logic' in question) {
      const keys = answerKeys(question, answer)
      const rule = question.logic.find((r) => keys.includes(r.when))
      if (rule) next = rule.goto === null ? questions.length : (position.get(rule.goto) ?? next)
    }
    i = Math.max(next, i + 1)
  }
  return path
}

/** Svaret som kort text, t.ex. i flödet. */
export function answerText(question: Question, answer: AnswerValue | undefined): string {
  if (!answer || !isAnswered(question, answer)) return ''
  switch (question.type) {
    case 'short_text':
    case 'long_text':
      return answer.text?.trim() ?? ''
    case 'choice': {
      const labels = question.choices.filter((c) => answer.choice_ids?.includes(c.id)).map((c) => c.label)
      if (answer.other_text?.trim()) labels.push(answer.other_text.trim())
      return labels.join(', ')
    }
    case 'yes_no':
      return answer.boolean ? 'Ja' : 'Nej'
    case 'rating':
      return `${answer.rating} av 5`
    case 'statement':
      return ''
  }
}

const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']

/** "2026-10-20" som datum i lokal tid, utan tidszonsförskjutning. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function weekdayName(day: string): string {
  return WEEKDAYS[parseDay(day).getDay()]
}

/** "Tisdagens redovisning". */
export function reportTitle(day: string): string {
  const name = weekdayName(day)
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}ens redovisning`
}

/** "tisdag 20 oktober". */
export function longDate(day: string): string {
  return parseDay(day).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function relativeDay(day: string, today = new Date()): string {
  const date = parseDay(day)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((start.getTime() - date.getTime()) / 86_400_000)
  if (diff === 0) return 'I dag'
  if (diff === 1) return 'I går'
  return date.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'numeric' })
}
