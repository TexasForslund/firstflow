import { Check } from 'lucide-react'

import styles from './CheckInSuccess.module.css'

/** Animerad bock när eleven har checkat in. Följer inställningen Minska rörelse. */
export function CheckInSuccess({ size = 'lg' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`${styles.wrap} ${styles[size]}`} aria-hidden="true">
      <span className={styles.ring} />
      <span className={styles.circle}>
        <Check className={styles.check} />
      </span>
    </span>
  )
}
