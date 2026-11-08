import type { Question, QuestionType } from '../../../api/forms'
import type { Goal } from '../../../api/goals'
import { newId } from './questionTypes'

/** Backend tar emot högst 20 alternativ. */
const MAX_CHOICES = 20

export type GoalTemplate = {
  id: string
  type: QuestionType
  kind: string
  title: string
  answers: { label: string; goal: string | null }[]
  note?: string
  /** Frågorna att lägga in. `nextId` är frågan efter, dit Nej hoppar (null = till slutet). */
  build: (nextId: string | null) => Question[]
}

const base = (title: string) => ({
  id: newId(),
  title,
  description: '',
  tracks: [] as string[],
  required: true,
  show_if: null,
})

/**
 * Färdiga frågor för ett av klassens mål, där svaret redan är kopplat till målet (idé 13, steg 5,
 * Texas skiss 2026-11-08). Byggs på målets namn, ingen AI.
 */
export function goalTemplates(goal: Goal, sameSubject: Goal[]): GoalTemplate[] {
  const topic = goal.name.charAt(0).toLowerCase() + goal.name.slice(1)
  const yesNoTitle = `Har du jobbat med ${topic} i dag?`
  const howTitle = `Hur gick det med ${topic} i dag?`
  const how = ['Jag gjorde det själv', 'Med hjälp av handledaren', 'Inte i dag']
  const templates: GoalTemplate[] = [
    {
      id: 'yes_no',
      type: 'yes_no',
      kind: 'Ja/Nej',
      title: yesNoTitle,
      answers: [
        { label: 'Ja', goal: goal.name },
        { label: 'Nej', goal: null },
      ],
      note: 'Om Ja kommer följdfrågan ”Berätta vad du gjorde.” Svaret följer med som beskrivning av underlaget.',
      build: () => {
        const parent = base(yesNoTitle)
        return [
          { ...parent, type: 'yes_no', logic: [], goals: [{ when: 'yes', goal_id: goal.id }] },
          {
            ...base('Berätta vad du gjorde.'),
            type: 'long_text',
            show_if: { question_id: parent.id, when: 'yes' },
          },
        ]
      },
    },
    {
      id: 'how',
      type: 'choice',
      kind: 'Flerval',
      title: howTitle,
      answers: how.map((label, i) => ({ label, goal: i === 0 ? goal.name : null })),
      build: () => {
        const choices = how.map((label) => ({ id: newId(), label }))
        return [
          {
            ...base(howTitle),
            type: 'choice',
            multiple: false,
            allow_other: false,
            logic: [],
            choices,
            goals: [{ when: choices[0].id, goal_id: goal.id }],
          },
        ]
      },
    },
  ]
  const all = sameSubject.slice(0, MAX_CHOICES)
  if (all.length >= 2) {
    templates.push({
      id: 'subject',
      type: 'choice',
      kind: 'Flerval, flera svar',
      title: 'Vad gjorde du i dag?',
      answers: all.map((g) => ({ label: g.name, goal: g.name })),
      note: 'Ett alternativ per mål i ämnet. Eleven kryssar i det hen gjorde.',
      build: () => {
        const choices = all.map((g) => ({ id: newId(), label: g.name }))
        return [
          {
            ...base('Vad gjorde du i dag?'),
            type: 'choice',
            multiple: true,
            allow_other: false,
            logic: [],
            choices,
            goals: all.map((g, i) => ({ when: choices[i].id, goal_id: g.id })),
          },
        ]
      },
    })
  }
  return templates
}
