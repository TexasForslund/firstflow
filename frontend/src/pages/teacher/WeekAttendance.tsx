import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useClassWeek, useRemindSupervisors, type ClassWeek } from '../../api/attendance'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button } from '../../components'
import { todayIso } from '../placements/period'
import { parseDay } from '../reports/answers'
import { DayMark } from './DayMark'
import styles from './WeekAttendance.module.css'

const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tors', 'Fre']

function waitingText(count: number) {
  return count === 1 ? '1 incheckning väntar på bekräftelse.' : `${count} incheckningar väntar på bekräftelse.`
}

function shiftWeek(day: string, weeks: number) {
  const d = parseDay(day)
  d.setDate(d.getDate() + weeks * 7)
  return todayIso(d)
}

function weekNumber(iso: string) {
  const d = parseDay(iso)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const firstThursday = new Date(d.getFullYear(), 0, 4)
  return (
    1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
  )
}

function range(week: ClassWeek) {
  const fmt = (iso: string, month: boolean) =>
    parseDay(iso).toLocaleDateString('sv-SE', month ? { day: 'numeric', month: 'long' } : { day: 'numeric' })
  return `vecka ${weekNumber(week.week_start)}, ${fmt(week.days[0], false)}–${fmt(week.days[4], true)}`
}

/**
 * Klassens närvaro vecka för vecka, med läget för varje dag (Texas skiss, 2026-10-29).
 * Överst syns incheckningar som väntar på handledaren, med Påminn handledarna.
 */
export function WeekAttendance({ classId }: { classId: string }) {
  const [start, setStart] = useState<string | undefined>()
  const query = useClassWeek(classId, start)
  const remind = useRemindSupervisors(classId)
  const { data: user } = useCurrentUser()
  const week = query.data

  return (
    <section className={styles.card} aria-labelledby="week-title">
      <div className={styles.head}>
        <div className={styles.heading}>
          <h2 id="week-title" className={styles.title}>
            Veckan
          </h2>
          {week && <span className={styles.muted}>{range(week)}</span>}
        </div>
        <div className={styles.nav}>
          <button
            type="button"
            className={styles.navButton}
            aria-label="Föregående vecka"
            onClick={() => week && setStart(shiftWeek(week.week_start, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.navButton}
            aria-label="Nästa vecka"
            onClick={() => week && setStart(shiftWeek(week.week_start, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>

      {query.isPending && <p className={styles.muted}>Laddar veckan…</p>}
      {query.isError && <p className={styles.muted}>{query.error.message}</p>}

      {week && week.waiting.length > 0 && (
        <div className={styles.waiting}>
          <span className={styles.waitingText}>
            <strong>{waitingText(week.waiting.reduce((sum, w) => sum + w.count, 0))}</strong>{' '}
            {week.waiting.map((w) => `${w.supervisor.name} (${w.count})`).join(', ')}.
          </span>
          {user?.role === 'teacher' && (
            <Button disabled={remind.isPending || remind.isSuccess} onClick={() => remind.mutate()}>
              {remind.isSuccess ? 'Påminda' : 'Påminn handledarna'}
            </Button>
          )}
        </div>
      )}

      {week && (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.studentCol}>
                  Elev
                </th>
                {week.days.map((day, i) => (
                  <th key={day} scope="col" data-today={day === week.today ? '' : undefined}>
                    {WEEKDAYS[i]}
                  </th>
                ))}
                <th scope="col" className={styles.supervisorCol}>
                  Handledare
                </th>
              </tr>
            </thead>
            <tbody>
              {week.students.map((row) => (
                <tr key={row.student.id}>
                  <th scope="row" className={styles.studentCol}>
                    <Link to={`/students/${row.student.id}`} className={styles.student}>
                      <Avatar name={row.student.name} size="sm" />
                      {row.student.name}
                    </Link>
                  </th>
                  {row.days.map((day) => (
                    <td key={day.date}>
                      {!day.on_apl ? (
                        <span className={styles.noApl} title="Ingen APL">
                          –<span className="sr-only">Ingen APL</span>
                        </span>
                      ) : day.date > week.today ? (
                        <span className="sr-only">Kommande dag</span>
                      ) : (
                        <DayMark state={day.state} checkedInAt={day.checked_in_at} showTime />
                      )}
                    </td>
                  ))}
                  <td className={styles.supervisorCol}>{row.supervisor?.name ?? 'Ingen praktikplats'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className={styles.legend} aria-label="Förklaring">
        <li>
          <span className={styles.swatch} data-state="confirmed" /> Bekräftad av handledaren
        </li>
        <li>
          <span className={styles.swatch} data-state="pending" /> Incheckad, väntar på handledaren
        </li>
        <li>
          <span className={styles.swatch} data-state="added">
            H
          </span>{' '}
          Eleven glömde, handledaren lade till
        </li>
        <li>
          <span className={styles.swatch} data-state="not_present" /> Inte på plats
        </li>
        <li>
          <span className={styles.swatch} data-state="conflict" /> Incheckad, men handledaren säger inte på plats
        </li>
        <li>
          <span className={styles.swatch} data-state="missing" /> Ej incheckad
        </li>
      </ul>
    </section>
  )
}
