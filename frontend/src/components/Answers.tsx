import { Minus, Plus, Star } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import styles from './Answers.module.css'

/** Svarsknappar, t.ex. Ja/Nej/Vet inte. Utan onChange visas de som ett lämnat svar. */
export function ChoiceChips({
  options,
  value,
  onChange,
  label,
}: {
  options: string[]
  value?: string
  onChange?: (value: string) => void
  label: string
}) {
  return (
    <div className={styles.chips} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option === value
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={!onChange}
            className={`${styles.chip} ${selected ? styles.selected : ''}`}
            onClick={() => onChange?.(option)}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

/** Fem stjärnor. Utan onChange visas betyget bara. */
export function StarRating({ value, onChange, label }: { value: number; onChange?: (v: number) => void; label: string }) {
  if (!onChange) {
    return (
      <div className={styles.stars} role="img" aria-label={`${label}: ${value} av 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} aria-hidden="true" className={n <= value ? styles.filled : styles.empty} />
        ))}
      </div>
    )
  }
  return (
    <div className={styles.stars} role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} av 5`}
          onClick={() => onChange(n)}
        >
          <Star aria-hidden="true" className={n <= value ? styles.filled : styles.empty} />
        </button>
      ))}
    </div>
  )
}

/** Fråga med "— se mindre" / "+ se mer" till höger. */
export function Collapsible({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()
  return (
    <div className={styles.collapsible}>
      <div className={styles.header}>
        <h3 className={styles.question}>{title}</h3>
        <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(!open)}>
          {open ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {open ? 'se mindre' : 'se mer'}
        </button>
      </div>
      <div id={contentId} hidden={!open} className={styles.content}>
        {children}
      </div>
    </div>
  )
}
