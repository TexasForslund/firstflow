import { CircleHelp, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { HELP, type HelpTopic } from './helpTexts'
import styles from './HelpPopover.module.css'

/**
 * "Vad är det här?" vid ett begrepp. Öppnar en liten ruta med förklaring och exempel.
 * Stängs med krysset, Esc eller ett klick utanför. På mobilen är rutan lika bred som skärmen.
 * Rutan läggs i body (portal) så att kort med overflow: hidden inte klipper den.
 */
export function HelpPopover({ topic, align = 'start' }: { topic: HelpTopic; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const id = useId()
  const text = HELP[topic]

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const width = popRef.current?.offsetWidth ?? 0
      const height = popRef.current?.offsetHeight ?? 0
      if (!trigger) return
      const left = align === 'end' ? trigger.right - width : trigger.left
      // Under knappen om det får plats, annars ovanför.
      const below = trigger.bottom + 8
      const top =
        below + height > window.innerHeight - 16 && trigger.top - 8 - height > 16 ? trigger.top - 8 - height : below
      setPos({ top, left: Math.max(16, Math.min(left, window.innerWidth - width - 16)) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Stäng bara rutan, inte en popup (dialog) som den ligger i.
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Node
      if (!wrapRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <span ref={wrapRef} className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Vad är det här? ${text.title}`}
        onClick={(e) => {
          // I en öppen popup (dialog) måste rutan ligga i den, annars hamnar den bakom.
          setContainer(e.currentTarget.closest('dialog') ?? document.body)
          setOpen((o) => !o)
        }}
      >
        <CircleHelp aria-hidden="true" />
        <span className={styles.triggerText}>Vad är det här?</span>
      </button>
      {open &&
        container &&
        createPortal(
          <span
            ref={popRef}
            id={id}
            role="dialog"
            aria-label={text.title}
            className={styles.popover}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
          >
            <span className={styles.head}>
              <span className={styles.title}>{text.title}</span>
              <button
                ref={closeRef}
                type="button"
                className={styles.close}
                aria-label="Stäng"
                onClick={() => {
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
              >
                <X aria-hidden="true" />
              </button>
            </span>
            <span className={styles.body}>{text.body}</span>
            <span className={styles.example}>
              <span className={styles.exampleLabel}>Exempel</span>
              {text.example}
            </span>
          </span>,
          container,
        )}
    </span>
  )
}
