import { parseDay } from '../reports/answers'

const DAY = 24 * 60 * 60 * 1000

export type PeriodStatus = 'upcoming' | 'active' | 'ended'

/** Dagens datum som ÅÅÅÅ-MM-DD i lokal tid. */
export function todayIso(today = new Date()): string {
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY)
}

/** "7 okt – 15 nov 2026". Året skrivs en gång om perioden ligger inom samma år. */
export function periodText(start: string, end: string): string {
  const s = parseDay(start)
  const e = parseDay(end)
  const sameYear = s.getFullYear() === e.getFullYear()
  const short = (d: Date, year: boolean) =>
    d
      .toLocaleDateString('sv-SE', {
        day: 'numeric',
        month: 'short',
        ...(year ? { year: 'numeric' } : {}),
      })
      .replace('.', '')
  return `${short(s, !sameYear)} – ${short(e, true)}`
}

export function periodStatus(start: string, end: string, today = todayIso()): PeriodStatus {
  if (today < start) return 'upcoming'
  if (today > end) return 'ended'
  return 'active'
}

/** Vecka i perioden räknat från startdagen, t.ex. { week: 3, weeks: 6 }. */
export function periodWeek(start: string, end: string, today = todayIso()): { week: number; weeks: number } {
  const weeks = Math.max(1, Math.ceil((daysBetween(start, end) + 1) / 7))
  const week = Math.min(weeks, Math.max(1, Math.floor(daysBetween(start, today) / 7) + 1))
  return { week, weeks }
}

/** Andel av perioden som har gått, 0–1. */
export function periodProgress(start: string, end: string, today = todayIso()): number {
  const total = daysBetween(start, end) + 1
  const passed = daysBetween(start, today) + 1
  return Math.min(1, Math.max(0, passed / total))
}

/** "Börjar i morgon", "Börjar om 5 dagar", "Slutar i dag", "Slutar om 12 dagar". */
export function periodCountdown(start: string, end: string, today = todayIso()): string {
  const status = periodStatus(start, end, today)
  if (status === 'upcoming') {
    const days = daysBetween(today, start)
    return days === 1 ? 'Börjar i morgon' : `Börjar om ${days} dagar`
  }
  if (status === 'ended') return 'Avslutad'
  const left = daysBetween(today, end)
  if (left === 0) return 'Sista dagen i dag'
  return left === 1 ? 'Slutar i morgon' : `Slutar om ${left} dagar`
}

/** Pågående placering, annars den närmaste kommande. Avslutade räknas inte. Listan ska vara i datumordning. */
export function currentPlacement<T extends { start_date: string; end_date: string }>(
  placements: T[],
  today = todayIso(),
): T | undefined {
  return (
    placements.find((p) => periodStatus(p.start_date, p.end_date, today) === 'active') ??
    placements.find((p) => periodStatus(p.start_date, p.end_date, today) === 'upcoming')
  )
}
