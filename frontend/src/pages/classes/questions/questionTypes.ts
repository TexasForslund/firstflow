import { AlignLeft, ListChecks, Quote, Star, TextCursorInput, ToggleLeft, type LucideIcon } from 'lucide-react'

import type { LogicRule, Question, QuestionType } from '../../../api/forms'

export type TypeGroup = 'text' | 'choice' | 'rating' | 'other'

interface TypeInfo {
  label: string
  description: string
  icon: LucideIcon
  group: TypeGroup
}

/** Frågetyperna i menyn "Lägg till fråga", färgkodade per grupp som i Typeform. */
export const QUESTION_TYPES: Record<QuestionType, TypeInfo> = {
  short_text: { label: 'Kort text', description: 'Ett kort svar på en rad', icon: TextCursorInput, group: 'text' },
  long_text: {
    label: 'Fritext',
    description: 'Ett längre svar, t.ex. vad eleven har gjort',
    icon: AlignLeft,
    group: 'text',
  },
  choice: {
    label: 'Flerval',
    description: 'Ett eller flera alternativ, med eller utan Annat',
    icon: ListChecks,
    group: 'choice',
  },
  yes_no: { label: 'Ja/Nej', description: 'Ett enkelt ja eller nej', icon: ToggleLeft, group: 'choice' },
  rating: { label: 'Betyg', description: 'Stjärnor från 1 till 5', icon: Star, group: 'rating' },
  statement: { label: 'Meddelande', description: 'Text utan svar, t.ex. en påminnelse', icon: Quote, group: 'other' },
}

export const TYPE_GROUPS: { id: TypeGroup; label: string; types: QuestionType[] }[] = [
  { id: 'text', label: 'Text', types: ['long_text', 'short_text'] },
  { id: 'choice', label: 'Val', types: ['choice', 'yes_no'] },
  { id: 'rating', label: 'Betyg', types: ['rating'] },
  { id: 'other', label: 'Övrigt', types: ['statement'] },
]

/** Bokstäverna framför alternativen, som i Typeform. */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const RATING_MAX = 5

export function newId(): string {
  // randomUUID finns bara i säkra sammanhang (https eller localhost). Annars byggs id:t själv.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function newQuestion(type: QuestionType): Question {
  const base = { id: newId(), title: '', description: '', tracks: [] as string[] }
  switch (type) {
    case 'short_text':
    case 'long_text':
      return { ...base, type, required: true }
    case 'choice':
      return {
        ...base,
        type,
        required: true,
        multiple: false,
        allow_other: false,
        logic: [],
        goals: [],
        choices: [
          { id: newId(), label: '' },
          { id: newId(), label: '' },
        ],
      }
    case 'yes_no':
      return { ...base, type, required: true, logic: [], goals: [] }
    case 'rating':
      return { ...base, type, required: true, logic: [] }
    case 'statement':
      return { ...base, type }
  }
}

/** Kopia med nya id:n, så att den räknas som en ny fråga. Logiken följer inte med. */
export function duplicateQuestion(question: Question): Question {
  const copy = { ...structuredClone(question), id: newId() }
  if (copy.type === 'choice') copy.choices = copy.choices.map((c) => ({ ...c, id: newId() }))
  if ('logic' in copy) copy.logic = []
  // Alternativen får nya id:n, så målen kopplas om av läraren.
  if (copy.type === 'choice') copy.goals = []
  return copy
}

export function hasLogic(question: Question): question is Extract<Question, { logic: LogicRule[] }> {
  return 'logic' in question
}

/** Svaren som en regel kan gälla för frågan: alternativ, ja/nej eller betyg. */
export function answerOptions(question: Question): { value: string; label: string }[] {
  switch (question.type) {
    case 'choice':
      return question.choices.map((c, i) => ({ value: c.id, label: c.label.trim() || `Alternativ ${LETTERS[i]}` }))
    case 'yes_no':
      return [
        { value: 'yes', label: 'Ja' },
        { value: 'no', label: 'Nej' },
      ]
    case 'rating':
      return Array.from({ length: RATING_MAX }, (_, i) => ({ value: String(i + 1), label: `${i + 1} stjärnor` }))
    default:
      return []
  }
}

/**
 * Tar bort regler som inte längre gäller: de pekar på en borttagen fråga, bakåt efter en
 * flytt, eller gäller ett alternativ som tagits bort. Backend godtar inte sådana regler.
 */
export function sanitizeLogic(questions: Question[]): { questions: Question[]; removed: number } {
  let removed = 0
  const position = new Map(questions.map((q, i) => [q.id, i]))
  const result = questions.map((question, i) => {
    if (!hasLogic(question)) return question
    const allowed = new Set(answerOptions(question).map((o) => o.value))
    const logic = question.logic.filter(
      (rule) => allowed.has(rule.when) && (rule.goto === null || (position.get(rule.goto) ?? -1) > i),
    )
    removed += question.logic.length - logic.length
    // Mål på ett alternativ som har tagits bort försvinner också (idé 10).
    const oldGoals = 'goals' in question ? question.goals : undefined
    const goals = oldGoals?.filter((g) => allowed.has(g.when))
    const changed = logic.length !== question.logic.length || (oldGoals && goals!.length !== oldGoals.length)
    if (!changed) return question
    return goals ? { ...question, logic, goals } : { ...question, logic }
  })
  return { questions: result, removed }
}

/** Det som måste rättas innan utkastet kan sparas. Tom lista = allt är i ordning. */
export function questionProblems(question: Question): string[] {
  const problems: string[] = []
  if (!question.title.trim()) problems.push('Frågan behöver en rubrik')
  if (question.type === 'choice') {
    if (question.choices.length < 2) problems.push('Lägg till minst två alternativ')
    if (question.choices.some((c) => !c.label.trim())) problems.push('Alla alternativ behöver en text')
  }
  return problems
}

export function questionTitle(question: Question): string {
  return question.title.trim() || 'Utan rubrik'
}
