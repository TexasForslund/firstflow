import { CalendarDays, PenLine, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { hoursSummary, hoursValid, usePlacementHours, useSaveOwnHours, type HoursDay } from '../../api/hours'
import { Card } from '../../components'
import { HoursEditor } from './HoursEditor'
import styles from './ScheduleCard.module.css'

/**
 * Elevens schema på handledarens sida om eleven: följer företagets arbetstider eller har egna
 * (Texas skiss "Schema och incheckning", 2026-11-07).
 */
export function ScheduleCard({ placementId, firstName }: { placementId: string; firstName: string }) {
  const hours = usePlacementHours(placementId)
  const [editing, setEditing] = useState(false)
  const data = hours.data

  return (
    <Card>
      <section className={styles.card} aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className={styles.title}>
          Schema
        </h2>
        {data && (
          <>
            <div className={styles.summary}>
              <CalendarDays aria-hidden="true" />
              <span className={styles.summaryText}>
                <span className={styles.strong}>
                  {data.own
                    ? `Egna tider för ${firstName}`
                    : data.days.length
                      ? 'Följer företagets arbetstider'
                      : 'Inga arbetstider inlagda'}
                </span>
                {data.days.length > 0 && <span className={styles.muted}>{hoursSummary(data.days)}</span>}
              </span>
            </div>
            <p className={styles.muted}>
              {data.days.length
                ? `${firstName} kan checka in från tio minuter innan dagen börjar.`
                : `${firstName} kan checka in när som helst. Lägg in tider för att ha koll på när dagen börjar.`}
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.pill} onClick={() => setEditing(true)}>
                <PenLine aria-hidden="true" /> {data.own ? 'Ändra egna tider' : `Egna tider för ${firstName}`}
              </button>
              <Link to="/company" className={styles.link}>
                {data.company_days.length ? 'Ändra företagets tider' : 'Lägg in företagets tider'}
              </Link>
            </div>
          </>
        )}
      </section>
      {editing && data && (
        <OwnHoursDialog
          placementId={placementId}
          firstName={firstName}
          initial={data.own ? data.days : data.company_days}
          own={data.own}
          onClose={() => setEditing(false)}
        />
      )}
    </Card>
  )
}

function OwnHoursDialog({
  placementId,
  firstName,
  initial,
  own,
  onClose,
}: {
  placementId: string
  firstName: string
  initial: HoursDay[]
  own: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const save = useSaveOwnHours(placementId)
  const [days, setDays] = useState(initial)

  useEffect(() => {
    const node = ref.current
    if (node && !node.open) node.showModal()
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate(days, { onSuccess: () => ref.current?.close() })
  }

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="own-hours-title">
      <form className={styles.frame} onSubmit={submit}>
        <header className={styles.head}>
          <h2 id="own-hours-title" className={styles.dialogTitle}>
            {firstName}s tider
          </h2>
          <button type="button" className={styles.close} aria-label="Stäng" onClick={() => ref.current?.close()}>
            <X aria-hidden="true" />
          </button>
        </header>
        <p className={styles.muted}>
          Egna tider gäller bara {firstName}. {firstName} kan checka in från tio minuter innan dagen börjar.
        </p>
        <HoursEditor value={days} onChange={setDays} />
        {save.isError && (
          <p className={styles.error} role="alert">
            {save.error.message}
          </p>
        )}
        <footer className={styles.foot}>
          {own && (
            <button
              type="button"
              className={styles.textButton}
              disabled={save.isPending}
              onClick={() => save.mutate(null, { onSuccess: () => ref.current?.close() })}
            >
              Följ företagets tider
            </button>
          )}
          <button type="button" className={styles.pill} onClick={() => ref.current?.close()}>
            Avbryt
          </button>
          <button type="submit" className={styles.primary} disabled={save.isPending || !hoursValid(days)}>
            Spara
          </button>
        </footer>
      </form>
    </dialog>
  )
}
