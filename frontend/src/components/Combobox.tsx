import { ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import type { SearchSelectOption } from './SearchSelect'
import styles from './SearchSelect.module.css'

interface ComboboxProps {
  label: string
  options: SearchSelectOption[]
  /** Valt alternativs id, eller tom sträng. */
  value: string
  onChange: (id: string) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Sökbar rullista för ett val (ARIA combobox). Skriv för att filtrera, pil upp/ned och Enter
 * för att välja, Escape för att stänga. Det valda alternativet visas i fältet.
 */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder = 'Sök…',
  emptyText = 'Inga alternativ',
  disabled,
}: ComboboxProps) {
  const id = useId()
  const listId = `${id}-list`
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find((o) => o.id === value)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return options
    return options.filter((o) => normalize(`${o.label} ${o.description ?? ''}`).includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0))
  const optionId = (index: number) => `${id}-option-${index}`

  function choose(option: SearchSelectOption) {
    onChange(option.id)
    setQuery('')
    setOpen(false)
    setActive(0)
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
      setQuery('')
    }
  }

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
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : (selected?.label ?? '')}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        {selected && !disabled ? (
          <button
            type="button"
            className={styles.clear}
            aria-label={`Rensa ${label.toLowerCase()}`}
            onClick={() => {
              onChange('')
              inputRef.current?.focus()
            }}
          >
            <X aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown aria-hidden="true" className={styles.chevron} />
        )}
      </div>
      {open && (
        <ul id={listId} role="listbox" className={styles.list} aria-label={label}>
          {filtered.length === 0 ? (
            <li className={styles.empty}>{options.length === 0 ? emptyText : 'Inga träffar'}</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.id}
                id={optionId(index)}
                role="option"
                aria-selected={option.id === value}
                className={`${styles.option} ${index === activeIndex ? styles.active : ''}`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(index)}
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
