import { Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { useMarkNotificationsRead, useNotifications } from '../api/invitations'
import styles from './NotificationBell.module.css'

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Nyss'
  if (minutes < 60) return `${minutes} min sedan`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} tim sedan`
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

/** Klockan i menyn med användarens notiser. Notiserna markeras som lästa när listan öppnas. */
export function NotificationBell() {
  const notifications = useNotifications()
  const markRead = useMarkNotificationsRead()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const unread = notifications.data?.unread ?? 0
  const items = notifications.data?.items ?? []

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current!.getBoundingClientRect()
    const width = Math.min(352, window.innerWidth - 32)
    setPosition({ top: rect.bottom + 8, left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)) })
    setOpen(true)
    if (unread > 0) markRead.mutate()
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-label={unread > 0 ? `Notiser, ${unread} olästa` : 'Notiser'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <Bell aria-hidden="true" />
        {unread > 0 && <span className={styles.dot}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div
          ref={panelRef}
          className={styles.panel}
          style={{ top: position.top, left: position.left }}
          role="dialog"
          aria-label="Notiser"
        >
          <p className={styles.title}>Notiser</p>
          {items.length === 0 ? (
            <p className={styles.empty}>Inga notiser än.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`${styles.item} ${n.read ? '' : styles.unread}`}
                    onClick={() => {
                      setOpen(false)
                      if (n.link) navigate(n.link)
                    }}
                  >
                    <span className={styles.text}>{n.text}</span>
                    <span className={styles.time}>{ago(n.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}
