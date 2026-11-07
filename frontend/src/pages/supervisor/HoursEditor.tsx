import { useState } from 'react'

import { hhmm, type HoursDay } from '../../api/hours'
import styles from './HoursEditor.module.css'

const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag']
const WEEKDAYS = [0, 1, 2, 3, 4]

// Svensk 24-timmarsklocka i kvartssteg. Webbläsarens tidsfält visar AM/PM på en engelsk dator
// (Texas, 2026-11-07: "Vi måste ha svenska klockan").
const TIMES = Array.from(
  { length: 96 },
  (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
)

function TimeSelect({
  value,
  onChange,
  ...props
}: {
  value: string
  onChange: (value: string) => void
  'aria-label': string
  'aria-invalid'?: boolean
}) {
  const options = TIMES.includes(value) ? TIMES : [...TIMES, value].sort()
  return (
    <select className={styles.time} value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  )
}

/**
 * Arbetstider måndag till söndag: en rad per dag med på/av och start- och sluttid, och en rad
 * överst som fyller i samma tider alla dagar (Texas skiss "Schema och incheckning", 2026-11-07).
 */
export function HoursEditor({ value, onChange }: { value: HoursDay[]; onChange: (days: HoursDay[]) => void }) {
  const [allStart, setAllStart] = useState(hhmm(value[0]?.start ?? '07:00'))
  const [allEnd, setAllEnd] = useState(hhmm(value[0]?.end ?? '16:00'))

  function setDay(weekday: number, day: HoursDay | null) {
    const rest = value.filter((d) => d.weekday !== weekday)
    onChange(day ? [...rest, day].sort((a, b) => a.weekday - b.weekday) : rest)
  }

  return (
    <div className={styles.editor}>
      <div className={styles.all}>
        <span className={styles.allLabel}>Samma tider alla dagar</span>
        <span className={styles.times}>
          <TimeSelect aria-label="Börjar, alla dagar" value={allStart} onChange={setAllStart} />
          <span className={styles.till}>till</span>
          <TimeSelect aria-label="Slutar, alla dagar" value={allEnd} onChange={setAllEnd} />
        </span>
        <button
          type="button"
          className={styles.use}
          disabled={!allStart || !allEnd || allEnd <= allStart}
          onClick={() => {
            // De dagar som är på, annars måndag till fredag. Helgen slås bara på för hand (Texas 2026-11-07).
            const on = value.length > 0 ? value.map((d) => d.weekday) : WEEKDAYS
            onChange(on.map((weekday) => ({ weekday, start: allStart, end: allEnd })))
          }}
        >
          Använd
        </button>
      </div>
      <ul className={styles.days}>
        {DAYS.map((name, weekday) => {
          const day = value.find((d) => d.weekday === weekday)
          const wrong = day && hhmm(day.end) <= hhmm(day.start)
          return (
            <li key={name} className={styles.day} data-off={day ? undefined : ''}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={!!day}
                  onChange={(e) => setDay(weekday, e.target.checked ? { weekday, start: allStart, end: allEnd } : null)}
                />
                <span className={styles.track} aria-hidden="true" />
                <span className={styles.name}>{name}</span>
              </label>
              {day ? (
                <span className={styles.times}>
                  <TimeSelect
                    aria-label={`${name} börjar`}
                    value={hhmm(day.start)}
                    onChange={(v) => setDay(weekday, { ...day, start: v })}
                  />
                  <span className={styles.till}>till</span>
                  <TimeSelect
                    aria-label={`${name} slutar`}
                    aria-invalid={wrong || undefined}
                    value={hhmm(day.end)}
                    onChange={(v) => setDay(weekday, { ...day, end: v })}
                  />
                </span>
              ) : (
                <span className={styles.off}>Ingen arbetsdag</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
