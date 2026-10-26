import { CalendarOff, Check, MapPinCheck, Thermometer } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import {
  useCheckIn,
  useMyAttendance,
  useReportAbsence,
  type AttendanceDay,
  type AttendanceStatus,
  type MyAttendance,
} from '../../api/attendance'
import { Button } from '../../components'
import { parseDay } from '../reports/answers'
import styles from './CheckIn.module.css'

const ABSENCE_DAYS_BACK = 7

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

const statusText: Record<AttendanceStatus, string> = {
  present: 'Incheckad',
  absent: 'Frånvarande',
  sick: 'Sjuk',
}

/** Elevens incheckning: en stor knapp, anmälan av frånvaro och veckans dagar. Mobilen först. */
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
          <AbsenceForm data={data} />
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
        <span className={styles.doneIcon}>
          <Check aria-hidden="true" />
        </span>
        <span>
          <p className={styles.cardTitle}>Incheckad {today.checked_in_at && time(today.checked_in_at)}</p>
          <p className={styles.muted}>{data.workplace_name}</p>
        </span>
      </section>
    )
  }

  return (
    <section className={styles.checkInBlock} aria-label="Checka in">
      {today && (
        <p className={styles.reported} role="status">
          {today.status === 'sick' ? <Thermometer aria-hidden="true" /> : <CalendarOff aria-hidden="true" />}
          Du har anmält dig {today.status === 'sick' ? 'sjuk' : 'frånvarande'} i dag. Kom du ändå? Checka in.
        </p>
      )}
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
          } else if (row) {
            state = row.status === 'present' ? 'present' : 'absent'
            text = statusText[row.status]
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

function AbsenceForm({ data }: { data: MyAttendance }) {
  const report = useReportAbsence()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(data.today)
  const [status, setStatus] = useState<'absent' | 'sick'>('sick')
  const [note, setNote] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const min = [addDays(data.today, -ABSENCE_DAYS_BACK), data.start_date!].sort().at(-1)
  const max = data.end_date!

  function submit(event: FormEvent) {
    event.preventDefault()
    setDone(null)
    report.mutate(
      { date, status, note: note.trim() || null },
      {
        onSuccess: (day) => {
          const when =
            day.date === data.today
              ? 'i dag'
              : parseDay(day.date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
          setDone(`Du är anmäld ${day.status === 'sick' ? 'sjuk' : 'frånvarande'} ${when}.`)
          setOpen(false)
          setNote('')
        },
      },
    )
  }

  if (!open) {
    return (
      <div className={styles.absenceClosed}>
        {done && (
          <p className={styles.success} role="status">
            {done}
          </p>
        )}
        <Button onClick={() => setOpen(true)}>Anmäl frånvaro</Button>
      </div>
    )
  }

  return (
    <section className={styles.card} aria-labelledby="absence-title">
      <h2 id="absence-title" className={styles.cardTitle}>
        Anmäl frånvaro
      </h2>
      <form className={styles.form} onSubmit={submit}>
        <fieldset className={styles.choices}>
          <legend className={styles.label}>Varför?</legend>
          {(['sick', 'absent'] as const).map((value) => (
            <label key={value} className={`${styles.choice} ${status === value ? styles.choiceOn : ''}`}>
              <input
                type="radio"
                name="status"
                value={value}
                checked={status === value}
                onChange={() => setStatus(value)}
              />
              {value === 'sick' ? 'Sjuk' : 'Annan frånvaro'}
            </label>
          ))}
        </fieldset>
        <label className={styles.field}>
          <span className={styles.label}>Datum</span>
          <input
            type="date"
            className={styles.input}
            value={date}
            min={min}
            max={max}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Kommentar (valfri)</span>
          <input
            type="text"
            className={styles.input}
            value={note}
            maxLength={300}
            placeholder={status === 'absent' ? 'Till exempel tandläkare' : ''}
            onChange={(e) => setNote(e.target.value)}
          />
          <span className={styles.hint}>Din lärare och handledare ser kommentaren.</span>
        </label>
        {report.isError && (
          <p className={styles.error} role="alert">
            {report.error.message}
          </p>
        )}
        <div className={styles.actions}>
          <Button onClick={() => setOpen(false)}>Avbryt</Button>
          <Button type="submit" variant="primary" disabled={report.isPending}>
            Anmäl
          </Button>
        </div>
      </form>
    </section>
  )
}
