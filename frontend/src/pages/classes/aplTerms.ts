import type { AplTerms } from '../../api/classes'

export const WEEKDAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']

/** Antal veckor i perioden, räknat från startdagens vecka till slutdagens. */
export function weeksBetween(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.floor(ms / (7 * 24 * 3600 * 1000)) + 1
}

/** Kort sammanfattning, t.ex. "10 veckor · 2 dagar/vecka". Tom om inget är bestämt. */
export function aplSummary(terms: AplTerms) {
  const parts: string[] = []
  if (terms.apl_start_date && terms.apl_end_date) {
    const weeks = weeksBetween(terms.apl_start_date, terms.apl_end_date)
    parts.push(`${weeks} ${weeks === 1 ? 'vecka' : 'veckor'}`)
  }
  if (terms.apl_days_per_week) parts.push(`${terms.apl_days_per_week} ${terms.apl_days_per_week === 1 ? 'dag' : 'dagar'}/vecka`)
  return parts.join(' · ')
}
