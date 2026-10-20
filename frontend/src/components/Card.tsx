import type { HTMLAttributes, ReactNode } from 'react'

import styles from './Card.module.css'

/** Vit yta med 1 px ram och 12 px radie. Ingen skugga. */
export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`${styles.card} ${className ?? ''}`} {...props} />
}

/** Rad längst ned i ett kort, avskild med en ram. */
export function CardFooter({ children, align = 'end' }: { children: ReactNode; align?: 'end' | 'between' }) {
  return <div className={`${styles.footer} ${align === 'between' ? styles.between : ''}`}>{children}</div>
}

/** Kortrubrik med valfri ikon. */
export function CardTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <h2 className={styles.title}>
      {icon}
      {children}
    </h2>
  )
}
