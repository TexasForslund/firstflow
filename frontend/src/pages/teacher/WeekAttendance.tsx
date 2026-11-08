import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { useClassWeek, useRemindSupervisors, type ClassWeek } from '../../api/attendance'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, HelpPopover } from '../../components'
import { todayIso } from '../placements/period'
import { parseDay } from '../reports/answers'
import { DayMark, Mark } from './DayMark'
import { shortWeekday, weekdayOf } from '../classes/aplTerms'
import styles from './WeekAttendance.module.css'

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
  return `vecka ${weekNumber(week.week_start)}, ${fmt(week.days[0], false)}–${fmt(week.days[week.days.length - 1], true)}`
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
            Veckan <HelpPopover topic="attendanceWeek" />
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
          <HelpPopover topic="remindSupervisors" align="end" />
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
                {week.days.map((day) => (
                  <th key={day} scope="col" data-today={day === week.today ? '' : undefined}>
                    {shortWeekday(weekdayOf(day))}
                  </th>
                ))}
                <th scope="col" className={styles.presentCol}>
                  På plats
                </th>
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
                        <DayMark
                          state={day.state}
                          checkedInAt={day.checked_in_at}
                          absenceReason={day.absence_reason}
                          absenceNote={day.absence_note}
                          showTime
                        />
                      )}
                    </td>
                  ))}
                  <td className={styles.presentCol}>{presentText(row.days, week.today)}</td>
                  <td className={styles.supervisorCol}>
                    {row.supervisor ? (
                      <span className={styles.supervisorCell}>
                        {row.supervisor.name}
                        <Link
                          to={`/messages?group=${row.student.id}`}
                          className={styles.messageLink}
                          aria-label={`Skriv i gruppen för ${row.student.name} och ${row.supervisor.name}`}
                          title="Skriv till eleven och handledaren"
                        >
                          <MessageSquare aria-hidden="true" />
                        </Link>
                      </span>
                    ) : (
                      'Ingen praktikplats'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.legend} aria-label="Förklaring" role="group">
        <LegendGroup title="Var där" tone="ok">
          <LegendItem mark={<Mark state="confirmed" small />} title="På plats" text="Bekräftad av handledaren" />
          <LegendItem
            mark={<Mark state="confirmed" added small />}
            title="På plats, H"
            text="Eleven glömde checka in, handledaren lade till"
          />
        </LegendGroup>
        <LegendGroup title="Väntar" tone="wait">
          <LegendItem
            mark={<Mark state="pending" small />}
            title="Incheckad"
            text="Handledaren har inte bekräftat än"
          />
          <LegendItem
            mark={<Mark state="conflict" small />}
            title="Stämmer inte"
            text="Incheckad, men handledaren säger inte på plats"
          />
        </LegendGroup>
        <LegendGroup title="Var inte där" tone="away">
          <LegendItem
            mark={<Mark state="not_present" small />}
            title="Inte på plats"
            text="Enligt handledaren, med förklaring"
          />
          <LegendItem
            mark={<Mark state="missing" small />}
            title="Ej incheckad"
            text="Ingen incheckning och ingen bekräftelse"
          />
        </LegendGroup>
        <HelpPopover topic="attendanceLegend" />
      </div>
    </section>
  )
}

/** Dagar på plats av APL-dagarna hittills i veckan. Incheckade dagar som väntar räknas med. */
function presentText(days: { on_apl: boolean; date: string; state: string }[], today: string) {
  const counted = days.filter((d) => d.on_apl && d.date <= today)
  if (counted.length === 0) return '–'
  const present = counted.filter((d) => d.state === 'confirmed' || d.state === 'pending').length
  return `${present} av ${counted.length}`
}

function LegendGroup({ title, tone, children }: { title: string; tone: 'ok' | 'wait' | 'away'; children: ReactNode }) {
  return (
    <div className={styles.legendGroup}>
      <span className={styles.legendTitle} data-tone={tone}>
        {title}
      </span>
      <ul className={styles.legendList}>{children}</ul>
    </div>
  )
}

function LegendItem({ mark, title, text }: { mark: ReactNode; title: string; text: string }) {
  return (
    <li className={styles.legendItem}>
      {mark}
      <span className={styles.legendText}>
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
    </li>
  )
}
