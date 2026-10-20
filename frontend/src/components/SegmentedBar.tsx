import styles from './SegmentedBar.module.css'

interface SegmentedBarProps {
  present: number
  absent: number
  total: number
  /** Beskrivning för skärmläsare, t.ex. "10 av 14 incheckade". */
  label: string
}

/** Närvarostapel i tre delar: grön (närvarande), röd (frånvarande), grå (övrigt). */
export function SegmentedBar({ present, absent, total, label }: SegmentedBarProps) {
  const rest = Math.max(total - present - absent, 0)
  return (
    <div className={styles.bar} role="img" aria-label={label}>
      {present > 0 && <span className={styles.present} style={{ flexGrow: present }} />}
      {absent > 0 && <span className={styles.absent} style={{ flexGrow: absent }} />}
      {rest > 0 && <span className={styles.rest} style={{ flexGrow: rest }} />}
    </div>
  )
}
