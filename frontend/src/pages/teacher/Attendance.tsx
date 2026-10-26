import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useClassAttendance, type StudentAttendance } from '../../api/attendance'
import { useClasses } from '../../api/classes'
import { Avatar, Card, Combobox, matches, SearchInput, SegmentedBar } from '../../components'
import styles from '../classes/Classes.module.css'
import { todayIso } from '../placements/period'
import { parseDay } from '../reports/answers'
import own from './Attendance.module.css'

type Preset = 'week' | '4weeks' | 'custom'

/** Elever med så här många dagar utan incheckning lyfts fram. */
const ATTENTION_MISSING = 2

function addDays(day: string, n: number) {
  const d = parseDay(day)
  d.setDate(d.getDate() + n)
  return todayIso(d)
}

function presetRange(preset: Preset, today: string): [string, string] | null {
  if (preset === 'week') {
    const weekday = (parseDay(today).getDay() + 6) % 7
    return [addDays(today, -weekday), today]
  }
  if (preset === '4weeks') return [addDays(today, -27), today]
  return null
}

/** Närvaro per elev i en klass under en period. Avvikelser överst. */
export function Attendance() {
  const classes = useClasses()
  const [params, setParams] = useSearchParams()
  const today = todayIso()
  const [preset, setPreset] = useState<Preset>('4weeks')
  const [custom, setCustom] = useState<[string, string]>([addDays(today, -27), today])
  const [search, setSearch] = useState('')

  const list = classes.data ?? []
  const classId = params.get('class') ?? list[0]?.id ?? ''
  const [from, to] = presetRange(preset, today) ?? custom
  const query = useClassAttendance(classId, from, to)

  const all = query.data?.students ?? []
  const students = all.filter((s) => matches(s.student.name, search)).sort(
    (a, b) => b.missing - a.missing || a.student.name.localeCompare(b.student.name, 'sv'),
  )
  const placed = all.filter((s) => s.has_placement)
  const checkedInToday = placed.filter((s) => s.today === 'present').length

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Närvaro</h1>
        <p className={styles.subtitle}>
          {query.data
            ? `${checkedInToday} av ${placed.length} elever på APL har checkat in i dag`
            : 'Incheckningar per elev'}
        </p>
      </header>

      {classes.isSuccess && list.length === 0 && (
        <Card>
          <p className={styles.empty}>Du har inga klasser än.</p>
        </Card>
      )}

      {list.length > 0 && (
        <div className={own.filters}>
          <div className={own.classSelect}>
            <Combobox
              label="Klass"
              value={classId}
              onChange={(id) => id && setParams({ class: id }, { replace: true })}
              placeholder="Sök klass"
              options={list.map((c) => ({ id: c.id, label: c.name, description: `${c.student_count} elever` }))}
            />
          </div>
          <fieldset className={own.presets}>
            <legend className={own.legend}>Period</legend>
            {(
              [
                ['week', 'Den här veckan'],
                ['4weeks', 'Senaste 4 veckorna'],
                ['custom', 'Välj datum'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={`${own.preset} ${preset === value ? own.presetOn : ''}`}>
                <input
                  type="radio"
                  name="period"
                  checked={preset === value}
                  onChange={() => setPreset(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {preset === 'custom' && (
            <div className={own.dates}>
              <label className={own.dateField}>
                <span className={own.legend}>Från</span>
                <input
                  type="date"
                  value={custom[0]}
                  max={custom[1]}
                  onChange={(e) => setCustom([e.target.value, custom[1]])}
                />
              </label>
              <label className={own.dateField}>
                <span className={own.legend}>Till</span>
                <input
                  type="date"
                  value={custom[1]}
                  min={custom[0]}
                  onChange={(e) => setCustom([custom[0], e.target.value])}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {query.isPending && classId && <p className={styles.state}>Laddar närvaron…</p>}
      {query.isError && <p className={styles.state}>{query.error.message}</p>}

      {query.data && (
        <Card>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Elever</h2>
            <span className={styles.count}>
              {parseDay(from).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} –{' '}
              {parseDay(to).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
            </span>
          </div>
          {!query.data.check_in_required && (
            <p className={own.note}>
              Klassen kräver inte incheckning, så dagar utan incheckning räknas inte som avvikelse.
            </p>
          )}
          {all.length > 0 && (
            <div className={own.search}>
              <SearchInput label="Sök elev" placeholder="Sök elev" value={search} onChange={setSearch} />
            </div>
          )}
          {students.length === 0 ? (
            <p className={styles.empty}>{all.length === 0 ? 'Klassen har inga elever.' : 'Ingen elev matchar sökningen.'}</p>
          ) : (
            <ul className={styles.list}>
              {students.map((s) => (
                <StudentRow key={s.student.id} row={s} />
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}

function StudentRow({ row }: { row: StudentAttendance }) {
  const total = Math.max(row.expected_days, row.present)
  const parts = [`${row.present} närvarande`, row.missing > 0 && `${row.missing} ej incheckad`].filter(Boolean)

  return (
    <li className={`${styles.row} ${own.row}`}>
      <Link to={`/students/${row.student.id}`} className={styles.rowLink}>
        <Avatar name={row.student.name} />
        <span className={styles.rowText}>
          <span className={styles.name}>{row.student.name}</span>
          <span className={styles.meta}>
            {row.has_placement
              ? row.today === 'present'
                ? 'Incheckad i dag'
                : 'Inte incheckad i dag'
              : 'Ingen praktikplats'}
          </span>
        </span>
      </Link>
      {row.has_placement && (
        <span className={own.stats}>
          <SegmentedBar
            present={row.present}
            absent={0}
            total={total}
            label={`${row.present} av ${total} dagar närvarande`}
          />
          <span className={own.numbers}>
            {parts.join(' · ')}
            {row.missing >= ATTENTION_MISSING && <span className={own.attention}>Följ upp</span>}
          </span>
        </span>
      )}
    </li>
  )
}
