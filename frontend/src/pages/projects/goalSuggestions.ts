import type { Goal } from '../../api/goals'

/** Vanliga ord som inte säger något om målet. */
const COMMON = new Set([
  'andra',
  'arbeta',
  'arbete',
  'arbetet',
  'deras',
  'efter',
  'eleven',
  'elever',
  'eleverna',
  'enkla',
  'enklare',
  'exempel',
  'genom',
  'grundläggande',
  'gällande',
  'kunna',
  'mellan',
  'också',
  'olika',
  'projekt',
  'projektet',
  'området',
  'tillhörande',
  'under',
  'vanligt',
  'förekommande',
])

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-zåäöéü]+/g) ?? []).filter((w) => w.length >= 5 && !COMMON.has(w))
}

/** Samma början räcker, så att "ritningen" hittar "ritningar". */
const stem = (word: string) => word.slice(0, 6)

export type GoalSuggestion = { goal: Goal; word: string }

/**
 * Klassens mål som passar orden i projektets beskrivning, bäst först (idé 13, steg 4). Enkel
 * ordmatchning mot målets namn och texten ur läroplanen, ingen AI.
 */
export function suggestGoals(description: string, goals: Goal[], chosen: Set<string>): GoalSuggestion[] {
  const described = new Map<string, string>()
  for (const word of words(description)) if (!described.has(stem(word))) described.set(stem(word), word)
  if (described.size === 0) return []
  const found: { goal: Goal; matched: string[] }[] = []
  for (const goal of goals) {
    if (chosen.has(goal.id)) continue
    const matched = [
      ...new Set(
        words(`${goal.name} ${goal.curriculum ?? ''}`).flatMap((w) => {
          const hit = described.get(stem(w))
          return hit ? [hit] : []
        }),
      ),
    ]
    if (matched.length > 0) found.push({ goal, matched })
  }
  return found.sort((a, b) => b.matched.length - a.matched.length).map((f) => ({ goal: f.goal, word: f.matched[0] }))
}
