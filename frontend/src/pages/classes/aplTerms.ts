import type { AplTerms } from '../../api/classes'

/** Vardagar, 0 = måndag … 4 = fredag. Ingen APL på helger. */
export const WEEKDAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag']
const SHORT = ['mån', 'tis', 'ons', 'tors', 'fre']

/** "måndag", "tis, ons och fre" eller "" om inga dagar är valda. */
export function weekdayList(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  if (sorted.length === 1) return WEEKDAYS[sorted[0]]
  const names = sorted.map((d) => SHORT[d])
  return `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`
}

/** Kort sammanfattning, t.ex. "2 dagar/vecka". Tom om inget är bestämt. */
export function aplSummary(terms: AplTerms) {
  const days = terms.apl_days_per_week
  return days ? `${days} ${days === 1 ? 'dag' : 'dagar'}/vecka` : ''
}
