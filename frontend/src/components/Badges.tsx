import { Folder, X } from 'lucide-react'
import type { ReactNode } from 'react'

import styles from './Badges.module.css'

/** Siffra i en liten ljuslila cirkel, t.ex. olästa meddelanden. */
export function CountBadge({
  count,
  label,
  tone = 'primary',
}: {
  count: number
  label?: string
  /** Färgen säger vad siffran gäller: lila olästa, persika att följa upp, gul att signera. */
  tone?: 'primary' | 'attention' | 'butter'
}) {
  return (
    <span className={`${styles.count} ${styles[tone]}`} aria-label={label ? `${count} ${label}` : undefined}>
      {count}
    </span>
  )
}

/** Ljuslila etikett med ikon, t.ex. ett projekt. */
export function Tag({ children, icon = <Folder aria-hidden="true" /> }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={styles.tag}>
      {icon}
      {children}
    </span>
  )
}

/** Grå etikett med ikon, t.ex. "5: Projekt tilldelade". */
export function InfoChip({ children, icon = <Folder aria-hidden="true" /> }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={styles.info}>
      {icon}
      {children}
    </span>
  )
}

/** Aktivt filter som kan tas bort. */
export function FilterChip({
  children,
  icon,
  onRemove,
  removeLabel,
}: {
  children: ReactNode
  icon?: ReactNode
  onRemove: () => void
  removeLabel: string
}) {
  return (
    <span className={styles.filter}>
      {icon}
      {children}
      <button type="button" className={styles.remove} onClick={onRemove} aria-label={removeLabel}>
        <X aria-hidden="true" />
      </button>
    </span>
  )
}
