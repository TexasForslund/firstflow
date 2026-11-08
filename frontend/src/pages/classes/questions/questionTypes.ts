import { AlignLeft, Images, ListChecks, Quote, Star, TextCursorInput, ToggleLeft, type LucideIcon } from 'lucide-react'

import type { LogicRule, Question, QuestionType } from '../../../api/forms'
import type { Goal } from '../../../api/goals'

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
  images: {
    label: 'Bilder',
    description: 'Eleven tar foton eller väljer bilder',
    icon: Images,
    group: 'other',
  },
  statement: { label: 'Meddelande', description: 'Text utan svar, t.ex. en påminnelse', icon: Quote, group: 'other' },
}

export const TYPE_GROUPS: { id: TypeGroup; label: string; types: QuestionType[] }[] = [
  { id: 'text', label: 'Text', types: ['long_text', 'short_text'] },
  { id: 'choice', label: 'Val', types: ['choice', 'yes_no'] },
  { id: 'rating', label: 'Betyg', types: ['rating'] },
  { id: 'other', label: 'Övrigt', types: ['images', 'statement'] },
]

/** Bokstäverna framför alternativen, som i Typeform. */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const RATING_MAX = 5

/** Högst antal bilder som läraren kan välja för en bildfråga. */
export const IMAGES_MAX = 10

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
  const base = { id: newId(), title: '', description: '', tracks: [] as string[], show_if: null }
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
    case 'images':
      return { ...base, type, required: true, max_images: 4 }
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
  // En följdfråga till ett alternativ som har tagits bort tas bort. En följdfråga vars fråga
  // inte finns blir en vanlig fråga.
  const byId = new Map(result.map((q) => [q.id, q]))
  const cleaned = result.flatMap((question, i) => {
    const rule = question.show_if
    if (!rule) return [question]
    const parent = byId.get(rule.question_id)
    if (!parent || parent.show_if || (position.get(parent.id) ?? i) >= i) return [{ ...question, show_if: null }]
    return answerOptions(parent).some((o) => o.value === rule.when) ? [question] : []
  })
  return { questions: cleaned, removed }
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

/** En fråga med sina följdfrågor. Följdfrågorna ligger direkt efter frågan i listan. */
export type Group = { question: Question; followUps: Question[] }

export function groupQuestions(questions: Question[]): Group[] {
  const groups: Group[] = []
  for (const q of questions) {
    const parent = q.show_if ? groups.find((g) => g.question.id === q.show_if!.question_id) : undefined
    if (parent) parent.followUps.push(q)
    else groups.push({ question: q, followUps: [] })
  }
  return groups
}

export function flatten(groups: Group[]): Question[] {
  return groups.flatMap((g) => [g.question, ...g.followUps])
}

/**
 * Ett äldre hopp som kan bli följdfrågor: en Ja/Nej-fråga där Nej hoppar över en eller två
 * frågor. Då blir de överhoppade frågorna följdfrågor om Ja. Ger frågorna som blir följdfrågor,
 * eller null om hoppet inte går att göra om.
 */
export function jumpAsFollowUps(questions: Question[], id: string): Question[] | null {
  const i = questions.findIndex((q) => q.id === id)
  const question = questions[i]
  if (!question || question.type !== 'yes_no' || question.show_if) return null
  if (question.logic.length !== 1 || question.logic[0].when !== 'no') return null
  const goto = question.logic[0].goto
  const end = goto === null ? questions.length : questions.findIndex((q) => q.id === goto)
  const skipped = questions.slice(i + 1, end)
  if (skipped.length < 1 || skipped.length > 2) return null
  const plain = skipped.every(
    (q) => !q.show_if && (!('logic' in q) || q.logic.length === 0) && q.type !== 'statement' && q.tracks.length === 0,
  )
  return plain ? skipped : null
}

/** Gör om hoppet till följdfrågor om Ja (se jumpAsFollowUps). */
export function convertJump(questions: Question[], id: string): Question[] {
  const skipped = jumpAsFollowUps(questions, id)
  if (!skipped) return questions
  const ids = new Set(skipped.map((q) => q.id))
  return questions.map((q) => {
    if (q.id === id && q.type === 'yes_no') return { ...q, logic: [] }
    if (ids.has(q.id)) return { ...q, show_if: { question_id: id, when: 'yes' } }
    return q
  })
}

/** Klassens mål som ingen fråga visar än. */
export function unusedGoals(questions: Question[], goals: Goal[]): Goal[] {
  const used = new Set(questions.flatMap((q) => ('goals' in q ? q.goals.map((g) => g.goal_id) : [])))
  return goals.filter((g) => g.class_id && !used.has(g.id))
}
