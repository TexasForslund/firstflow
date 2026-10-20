import type { QuestionType } from '../../../api/forms'
import styles from './FormBuilder.module.css'
import { QUESTION_TYPES } from './questionTypes'

/** Färgad ruta med frågetypens ikon och frågans nummer, som i Typeforms frågelista. */
export function TypeBadge({ type, number }: { type: QuestionType; number?: number }) {
  const info = QUESTION_TYPES[type]
  const Icon = info.icon
  return (
    <span className={`${styles.badge} ${styles[`group-${info.group}`]}`} aria-hidden="true">
      <Icon />
      {number !== undefined && <span className={styles.badgeNumber}>{number}</span>}
    </span>
  )
}
