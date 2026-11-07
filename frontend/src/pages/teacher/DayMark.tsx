import { Check, Minus } from 'lucide-react'

import { clockTime, dayStateText, type DayState } from '../../api/attendance'
import { absenceLabel, type AbsenceReason } from '../supervisor/absence'
import styles from './DayMark.module.css'

/**
 * Dagens läge som en rund markering (Texas skiss, 2026-10-29): grön = bekräftad, blå ring =
 * väntar på handledaren, röd = inte på plats, streckad = ej incheckad. "H" betyder att
 * handledaren lade till dagen, och en röd prick att incheckningen och handledaren inte stämmer.
 */
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
      <span className={styles.mark} data-state={conflict ? 'conflict' : state} aria-hidden="true">
        {(state === 'confirmed' || state === 'pending' || conflict) && <Check />}
        {state === 'not_present' && !conflict && <Minus />}
        {added && <span className={styles.added}>H</span>}
        {conflict && <span className={styles.dot} />}
      </span>
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
