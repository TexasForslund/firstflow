import type { Project } from '../../api/projects'

/** Mjuka färger för projektikonen, så att projekten går att skilja åt i listan. */
const TONES = ['mint', 'sky', 'butter', 'primary'] as const
export type Tone = (typeof TONES)[number]

export function projectTone(id: string): Tone {
  let sum = 0
  for (const char of id) sum = (sum + char.charCodeAt(0)) % 997
  return TONES[sum % TONES.length]
}

const DAY = 24 * 60 * 60 * 1000

function localDate(iso: string) {
  return new Date(`${iso}T12:00:00`)
}

export function shortDate(iso: string) {
  return localDate(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

export function longDate(iso: string) {
  return localDate(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
}

/** "om 29 dagar", "i dag" eller "för 3 dagar sedan". */
export function daysLeftText(iso: string) {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const days = Math.round((localDate(iso).getTime() - today.getTime()) / DAY)
  if (days === 0) return 'i dag'
  if (days === 1) return 'i morgon'
  if (days > 0) return `om ${days} dagar`
  return days === -1 ? 'i går' : `för ${-days} dagar sedan`
}

/** Hur stor del av tiden från start till slutdatum som har gått, 0–100. Null utan slutdatum. */
export function progress(project: Project): number | null {
  if (project.completed_at) return 100
  if (!project.deadline) return null
  const start = new Date(project.created_at).getTime()
  const end = localDate(project.deadline).getTime()
  if (end <= start) return 100
  return Math.max(0, Math.min(100, Math.round(((Date.now() - start) / (end - start)) * 100)))
}

export function reportsWord(count: number) {
  return count === 1 ? 'redovisning' : 'redovisningar'
}
