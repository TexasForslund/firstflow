import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import styles from './SearchSelect.module.css'

export interface SearchSelectOption {
  id: string
  label: string
  description?: string
}

interface SearchSelectProps {
  label: string
  options: SearchSelectOption[]
  onSelect: (option: SearchSelectOption) => void
  placeholder?: string
  /** Visas när det inte finns några alternativ alls. */
  emptyText?: string
  disabled?: boolean
}

/** Gemener utan accenter, så att "ostlund" hittar "Östlund". */
function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Rullista med sökfält (ARIA combobox). Skriv för att filtrera, pil upp/ned för att välja,
 * Enter för att lägga till och Escape för att stänga. Fältet töms efter varje val.
 */
export function SearchSelect({
  label,
  options,
  onSelect,
  placeholder = 'Sök…',
  emptyText = 'Inga alternativ',
  disabled,
}: SearchSelectProps) {
  const id = useId()
  const listId = `${id}-list`
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return options
    return options.filter((o) => normalize(`${o.label} ${o.description ?? ''}`).includes(q))
  }, [options, query])

  // Stäng när man klickar utanför.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0))

  function choose(option: SearchSelectOption) {
    onSelect(option)
    setQuery('')
    setActive(0)
    inputRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        event.preventDefault()
        choose(filtered[activeIndex])
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const optionId = (index: number) => `${id}-option-${index}`

  return (
    <div className={styles.root} ref={rootRef}>
      <label htmlFor={`${id}-input`} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <Search aria-hidden="true" className={styles.searchIcon} />
        <input
          ref={inputRef}
          id={`${id}-input`}
          className={styles.input}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered.length > 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className={styles.list}>
          {filtered.length === 0 ? (
            <li className={styles.empty} role="presentation">
              {options.length === 0 ? emptyText : `Ingen träff på "${query.trim()}"`}
            </li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className={`${styles.option} ${index === activeIndex ? styles.active : ''}`}
                onPointerDown={(e) => e.preventDefault()} // behåll fokus i fältet
                onClick={() => choose(option)}
                onPointerEnter={() => setActive(index)}
              >
                <span className={styles.optionLabel}>{option.label}</span>
                {option.description && <span className={styles.optionDescription}>{option.description}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
