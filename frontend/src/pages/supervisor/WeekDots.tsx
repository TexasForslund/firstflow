import { Check, X } from 'lucide-react'

import styles from './WeekDots.module.css'
import type { weekDays } from './weekDays'

const label: Record<string, string> = {
  confirmed: 'på plats',
  pending: 'incheckad, väntar på dig',
  not_present: 'inte på plats',
  missing: 'ingen incheckning',
}

/** Fem prickar för veckan: på plats, väntar på dig, inte på plats eller ingen incheckning. */
export function WeekDots({ days }: { days: ReturnType<typeof weekDays> }) {
  return (
    <ol className={styles.week} aria-label="Veckans närvaro">
      {days.map((d) => {
        const state = d.future ? 'future' : (d.item?.state ?? 'none')
        const text = d.future ? 'kommer' : d.item ? label[d.item.state] : 'ingen APL'
        return (
          <li key={d.date} className={styles.day}>
            <span className={styles.dot} data-state={state} data-today={d.isToday ? '' : undefined}>
              {state === 'confirmed' && <Check aria-hidden="true" />}
              {state === 'not_present' && <X aria-hidden="true" />}
            </span>
            <span className={styles.name} aria-hidden="true">
              {d.name}
            </span>
            <span className="sr-only">
              {d.name}: {text}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
