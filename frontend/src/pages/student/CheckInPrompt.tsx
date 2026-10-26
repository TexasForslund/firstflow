import { MapPinCheck, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'

import { useCheckIn, useMyAttendance } from '../../api/attendance'
import { Button } from '../../components'
import { todayIso } from '../placements/period'
import styles from './CheckInPrompt.module.css'
import { CheckInSuccess } from './CheckInSuccess'

/** Påminnelsen visas från 08:30 på en APL-dag (Texas, 2026-10-26). */
const PROMPT_FROM = { hour: 8, minute: 30 }
const DISMISSED_KEY = 'firstflow-checkin-dismissed'
const SUCCESS_MS = 2200

function afterPromptTime(now: Date) {
  return (
    now.getHours() > PROMPT_FROM.hour || (now.getHours() === PROMPT_FROM.hour && now.getMinutes() >= PROMPT_FROM.minute)
  )
}

function dismissedToday() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === todayIso()
  } catch {
    return false
  }
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Elevens påminnelse om att checka in. Första gången eleven öppnar appen en APL-dag efter
 * 08:30 visas en ruta mitt på skärmen. Stänger eleven den visas i stället en rad högst upp
 * på varje sida tills eleven har checkat in.
 */
export function CheckInPrompt({ firstName }: { firstName: string }) {
  const { pathname } = useLocation()
  const attendance = useMyAttendance()
  const checkIn = useCheckIn()
  const [now, setNow] = useState(() => new Date())
  const [dismissed, setDismissed] = useState(dismissedToday)
  const [justCheckedIn, setJustCheckedIn] = useState<string | null>(null)

  // Kolla klockan varje minut, så att påminnelsen dyker upp 08:30 även om appen redan är öppen.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!justCheckedIn) return
    const timer = setTimeout(() => setJustCheckedIn(null), SUCCESS_MS)
    return () => clearTimeout(timer)
  }, [justCheckedIn])

  const data = attendance.data
  const checkedIn = data?.days.some((d) => d.date === data.today) ?? false
  const due = !!data?.placement_id && data.can_check_in_today && !checkedIn && afterPromptTime(now)
  // Sidan Incheckning och redovisningen (helskärm) har ingen egen påminnelse.
  const quietPage = pathname.startsWith('/check-in') || pathname.endsWith('/answer')

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, todayIso())
    } catch {
      // Utan lagring visas rutan igen nästa gång sidan laddas.
    }
  }

  function doCheckIn() {
    checkIn.mutate(undefined, { onSuccess: (day) => setJustCheckedIn(day.checked_in_at ?? '') })
  }

  if (justCheckedIn !== null && !quietPage) {
    return dismissed ? (
      <div className={`${styles.banner} ${styles.bannerDone}`} role="status">
        <CheckInSuccess size="md" />
        <span className={styles.bannerText}>Incheckad {justCheckedIn && time(justCheckedIn)}. Ha en bra dag!</span>
      </div>
    ) : (
      <PromptDialog onClose={() => setJustCheckedIn(null)}>
        <div className={styles.success} role="status">
          <CheckInSuccess />
          <p className={styles.title}>Incheckad {justCheckedIn && time(justCheckedIn)}</p>
          <p className={styles.text}>Ha en bra dag på {data?.workplace_name}!</p>
        </div>
      </PromptDialog>
    )
  }

  if (!due || quietPage) return null

  if (!dismissed) {
    return (
      <PromptDialog onClose={dismiss}>
        <button type="button" className={styles.close} aria-label="Stäng" onClick={dismiss}>
          <X aria-hidden="true" />
        </button>
        <div className={styles.content}>
          <span className={styles.icon}>
            <MapPinCheck aria-hidden="true" />
          </span>
          <p className={styles.title} id="check-in-title">
            {now.getHours() < 10 ? 'God morgon' : 'Hej'}{firstName ? ` ${firstName}` : ''}!
          </p>
          <p className={styles.text}>Checka in för dagen på {data?.workplace_name}.</p>
          <button type="button" className={styles.checkInButton} onClick={doCheckIn} disabled={checkIn.isPending}>
            {checkIn.isPending ? 'Checkar in…' : 'Checka in'}
          </button>
          {checkIn.isError && (
            <p className={styles.error} role="alert">
              {checkIn.error.message}
            </p>
          )}
          <button type="button" className={styles.later} onClick={dismiss}>
            Inte nu
          </button>
        </div>
      </PromptDialog>
    )
  }

  return (
    <div className={styles.banner} role="region" aria-label="Incheckning">
      <MapPinCheck aria-hidden="true" className={styles.bannerIcon} />
      <span className={styles.bannerText}>Du har inte checkat in i dag.</span>
      <Button variant="primary" onClick={doCheckIn} disabled={checkIn.isPending}>
        {checkIn.isPending ? 'Checkar in…' : 'Checka in för dagen'}
      </Button>
      {checkIn.isError && (
        <p className={styles.error} role="alert">
          {checkIn.error.message}
        </p>
      )}
    </div>
  )
}

function PromptDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="check-in-title" onClose={onClose}>
      {children}
    </dialog>
  )
}
