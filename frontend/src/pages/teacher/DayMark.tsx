import { Check, Clock, Minus, X } from 'lucide-react'

import { clockTime, dayStateText, type DayState } from '../../api/attendance'
import { absenceLabel, type AbsenceReason } from '../supervisor/absence'
import styles from './DayMark.module.css'

/**
 * Dagens läge som en rund markering, i tre färggrupper (Texas skiss "Tydligare närvaro",
 * 2026-11-08): grön bock = på plats, blå klocka = väntar på handledaren, gul ! = stämmer inte,
 * röd kryss = inte på plats och streckad röd ring = ej incheckad. "H" betyder att handledaren
 * lade till dagen.
 */
export type MarkState = DayState | 'conflict'

/** Bara själva ringen, utan text. Används också i förklaringen under tabellen. */
export function Mark({ state, added = false, small = false }: { state: MarkState; added?: boolean; small?: boolean }) {
  return (
    <span className={styles.mark} data-state={state} data-small={small ? '' : undefined} aria-hidden="true">
      {state === 'confirmed' && <Check />}
      {state === 'pending' && <Clock />}
      {state === 'conflict' && <span className={styles.excl}>!</span>}
      {state === 'not_present' && <X />}
      {state === 'missing' && <Minus />}
      {added && <span className={styles.added}>H</span>}
    </span>
  )
}

export function DayMark({
  state,
  checkedInAt,
  showTime = false,
  absenceReason,
  absenceNote,
}: {
  state: DayState
  checkedInAt?: string | null
  showTime?: boolean
  /** Handledarens förklaring när eleven inte var på plats (Texas, 2026-11-07). */
  absenceReason?: AbsenceReason | null
  absenceNote?: string | null
}) {
  const conflict = state === 'not_present' && !!checkedInAt
  const added = state === 'confirmed' && !checkedInAt
  const reason = state === 'not_present' && absenceReason ? absenceLabel[absenceReason] : null
  const note = state === 'not_present' && absenceNote ? absenceNote : null
  const text = [dayStateText(state, checkedInAt), reason, note && `”${note}”`].filter(Boolean).join(' · ')
  return (
    <span className={styles.wrap} title={text}>
      <span className="sr-only">{text}</span>
      <Mark state={conflict ? 'conflict' : state} added={added} />
      {showTime && checkedInAt && (state === 'pending' || conflict) && (
        <span className={styles.time} data-conflict={conflict ? '' : undefined} aria-hidden="true">
          {clockTime(checkedInAt)}
        </span>
      )}
      {showTime && reason && (
        <span className={styles.reason} aria-hidden="true">
          {reason}
          {note && '*'}
        </span>
      )}
    </span>
  )
}
