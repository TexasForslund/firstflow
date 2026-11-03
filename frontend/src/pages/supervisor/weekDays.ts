import type { ReviewItem } from '../../api/attendance'
import type { components } from '../../api/schema'

type ReviewList = components['schemas']['ReviewList']

const DAY_NAMES = ['Mån', 'Tis', 'Ons', 'Tors', 'Fre']

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Veckans dagar för en praktikplats, måndag till fredag, från handledarens närvarolista. */
export function weekDays(review: ReviewList | undefined, placementId: string) {
  if (!review) return []
  const today = review.today
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7
  const monday = addDays(today, -weekday)
  const items = new Map<string, ReviewItem>()
  for (const item of [...review.today_items, ...review.recent_days]) {
    if (item.placement_id === placementId) items.set(item.date, item)
  }
  return DAY_NAMES.map((name, i) => {
    const date = addDays(monday, i)
    return { name, date, item: items.get(date), future: date > today, isToday: date === today }
  })
}
