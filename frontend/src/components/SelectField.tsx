import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import styles from './SelectField.module.css'

interface SelectFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}

/** Rullista med etikett kopplad via id, så att skärmläsare bara läser upp etiketten. */
export function SelectField({ label, value, onChange, children }: SelectFieldProps) {
  const id = useId()
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <select id={id} className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </div>
    </div>
  )
}
