import { Search } from 'lucide-react'

import styles from './SearchSelect.module.css'

/** Sökfält som filtrerar en lista direkt, t.ex. elever. */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder = 'Sök…',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className={styles.control}>
      <Search aria-hidden="true" className={styles.searchIcon} />
      <input
        type="search"
        className={styles.input}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
