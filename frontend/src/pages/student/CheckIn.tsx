import { CalendarOff, Check, MapPinCheck } from 'lucide-react'

import {
  useCheckIn,
  useMyAttendance,
  type AttendanceDay,
  type MyAttendance,
} from '../../api/attendance'
import { parseDay } from '../reports/answers'
import styles from './CheckIn.module.css'
import { CheckInSuccess } from './CheckInSuccess'

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(day: string, n: number) {
  const d = parseDay(day)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

/** Elevens incheckning: en stor knapp och veckans dagar. Mobilen först. */
export function CheckIn() {
  const query = useMyAttendance()
  const data = query.data

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Incheckning</h1>
        {data && (
          <p className={styles.date}>
            {parseDay(data.today).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        )}
      </header>

      {query.isPending && <p className={styles.state}>Laddar…</p>}
      {query.isError && <p className={styles.state}>Incheckningen gick inte att hämta. Ladda om sidan.</p>}

      {data && !data.placement_id && (
        <div className={styles.empty}>
          <CalendarOff aria-hidden="true" />
          <p className={styles.emptyTitle}>Ingen APL i dag</p>
          <p className={styles.emptyText}>Du har ingen pågående praktikplats. Incheckningen öppnar när din APL börjar.</p>
        </div>
      )}

      {data?.placement_id && (
        <>
          <Today data={data} />
          <Week data={data} />
        </>
      )}
    </div>
  )
}

function Today({ data }: { data: MyAttendance }) {
  const checkIn = useCheckIn()
  const today = data.days.find((d) => d.date === data.today)

  if (!data.can_check_in_today) {
    return (
      <section className={styles.card}>
        <p className={styles.cardTitle}>Det är helg</p>
        <p className={styles.muted}>Ingen incheckning i dag. Vi ses på måndag!</p>
      </section>
    )
  }

  if (today?.status === 'present') {
    return (
      <section className={`${styles.card} ${styles.done}`} role="status">
        {checkIn.isSuccess ? (
          <CheckInSuccess size="md" />
        ) : (
          <span className={styles.doneIcon}>
            <Check aria-hidden="true" />
          </span>
        )}
        <span>
          <p className={styles.cardTitle}>Incheckad {today.checked_in_at && time(today.checked_in_at)}</p>
          <p className={styles.muted}>{data.workplace_name}</p>
        </span>
      </section>
    )
  }

  return (
    <section className={styles.checkInBlock} aria-label="Checka in">
      <button
        type="button"
        className={styles.checkInButton}
        onClick={() => checkIn.mutate()}
        disabled={checkIn.isPending}
      >
        <MapPinCheck aria-hidden="true" />
        <span>
          <span className={styles.checkInLabel}>{checkIn.isPending ? 'Checkar in…' : 'Checka in'}</span>
          <span className={styles.checkInPlace}>{data.workplace_name}</span>
        </span>
      </button>
      {checkIn.isError && (
        <p className={styles.error} role="alert">
          {checkIn.error.message}
        </p>
      )}
      {!data.check_in_required && (
        <p className={styles.muted}>Din klass kräver inte incheckning, men du får gärna checka in.</p>
      )}
    </section>
  )
}

/** Måndag–fredag den här veckan, med dagens status som en prick. */
function Week({ data }: { data: MyAttendance }) {
  const todayDate = parseDay(data.today)
  const monday = addDays(data.today, -((todayDate.getDay() + 6) % 7))
  const days = Array.from({ length: 5 }, (_, i) => addDays(monday, i))
  const byDate = new Map<string, AttendanceDay>(data.days.map((d) => [d.date, d]))
  const inPlacement = (day: string) => day >= data.start_date! && day <= data.end_date!

  return (
    <section className={styles.card} aria-labelledby="week-title">
      <h2 id="week-title" className={styles.cardTitle}>
        Den här veckan
      </h2>
      <ol className={styles.week}>
        {days.map((day) => {
          const row = byDate.get(day)
          const past = day < data.today
          const label = parseDay(day).toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '')
          let state = 'future'
          let text = 'Kommande'
          if (!inPlacement(day)) {
            state = 'none'
            text = 'Ingen APL'
          } else if (row?.status === 'present') {
            state = 'present'
            text = 'Incheckad'
          } else if (past) {
            state = 'missing'
            text = 'Inte incheckad'
          } else if (day === data.today) {
            text = 'I dag'
          }
          return (
            <li key={day} className={`${styles.day} ${day === data.today ? styles.dayToday : ''}`}>
              <span className={styles.dayName}>{label}</span>
              <span className={`${styles.dot} ${styles[state]}`} aria-hidden="true">
                {state === 'present' && <Check />}
              </span>
              <span className={styles.srOnly}>
                {parseDay(day).toLocaleDateString('sv-SE', { weekday: 'long' })}: {text}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
