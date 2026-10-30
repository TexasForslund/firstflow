import type { AplTerms } from '../../api/classes'

/** Veckodagar, 0 = måndag … 6 = söndag. APL kan vara även på helger (Texas, 2026-10-30). */
export const WEEKDAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']
const SHORT = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön']

/** "måndag", "tis, ons och fre" eller "" om inga dagar är valda. */
export function weekdayList(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  if (sorted.length === 1) return WEEKDAYS[sorted[0]]
  const names = sorted.map((d) => SHORT[d])
  return `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`
}

/** Kort namn på veckodagen, t.ex. "Mån". */
export function shortWeekday(day: number) {
  const name = SHORT[day]
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Veckodagen för ett datum, 0 = måndag … 6 = söndag. */
export function weekdayOf(iso: string) {
  return (new Date(`${iso}T12:00:00`).getDay() + 6) % 7
}

/** Kort sammanfattning, t.ex. "4 APL-dagar/vecka". Tom om inget är bestämt. */
export function aplSummary(terms: AplTerms) {
  const days = terms.apl_weekdays?.length ?? 0
  return days ? `${days} APL-${days === 1 ? 'dag' : 'dagar'}/vecka` : ''
}
