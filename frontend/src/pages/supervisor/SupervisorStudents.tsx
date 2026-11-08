import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'

import { noteTagLabel } from '../../api/notes'
import { useSupervisorStudentList } from '../../api/students'
import { Avatar, Card, matches, SearchInput } from '../../components'
import { periodWeek } from '../placements/period'
import styles from './SupervisorStudents.module.css'

type Row = NonNullable<ReturnType<typeof useSupervisorStudentList>['data']>[number]

function shortDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

function periodLabel(row: Row) {
  if (row.status === 'upcoming') return `Börjar ${shortDay(row.start_date)}`
  if (row.status === 'ended') return `Slutade ${shortDay(row.end_date)}`
  const { week, weeks } = periodWeek(row.start_date, row.end_date)
  return `Vecka ${week} av ${weeks}`
}

/** Den gamla adressen till elevens sida, från notiser och mejl. */
export function OldStudentPath() {
  const { studentId = '' } = useParams()
  return <Navigate to={`/supervised-students/${studentId}`} replace />
}

/**
 * Mina elever (Texas skiss "Handledarens elever", 2026-11-08): alla elever som har, har haft eller
 * ska ha APL hos handledaren. Pågår och Kommande syns, Avslutade är hopfällda.
 */
export function SupervisorStudents() {
  const list = useSupervisorStudentList()
  const [search, setSearch] = useState('')
  const rows = (list.data ?? []).filter((r) => matches(`${r.student.name} ${r.class_name ?? ''}`, search))
  const by = (status: Row['status']) => rows.filter((r) => r.status === status)
  const searching = search.trim() !== ''

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Mina elever</h1>
        <p className={styles.muted}>Alla elever som har eller har haft APL hos dig.</p>
      </header>
      {(list.data?.length ?? 0) > 0 && (
        <div className={styles.search}>
          <SearchInput label="Sök elev" placeholder="Sök elev" value={search} onChange={setSearch} />
        </div>
      )}
      {list.isPending && <p className={styles.muted}>Laddar elever…</p>}
      {list.isError && <p className={styles.muted}>Det gick inte att hämta eleverna. Ladda om sidan.</p>}
      {list.isSuccess && list.data.length === 0 && (
        <Card>
          <p className={styles.empty}>Du har inga elever än. De syns här när läraren har placerat dem hos dig.</p>
        </Card>
      )}
      {list.isSuccess && list.data.length > 0 && rows.length === 0 && (
        <p className={styles.muted}>Ingen elev matchar ”{search.trim()}”.</p>
      )}
      <Group title="Pågår" rows={by('ongoing')} />
      <Group title="Kommande" rows={by('upcoming')} />
      <Group title="Avslutade" rows={by('ended')} collapsed={!searching} />
    </div>
  )
}

function Group({ title, rows, collapsed = false }: { title: string; rows: Row[]; collapsed?: boolean }) {
  if (rows.length === 0) return null
  const count = `${rows.length} ${rows.length === 1 ? 'elev' : 'elever'}`
  const list = (
    <>
      <div className={styles.columnsHead} aria-hidden="true">
        <span>Elev</span>
        <span>Period</span>
        <span>Närvaro</span>
        <span>Redovisningar</span>
        <span>Senaste anteckning</span>
      </div>
      <ul className={styles.list}>
        {rows.map((row) => (
          <StudentRow key={row.student.id} row={row} />
        ))}
      </ul>
    </>
  )
  return (
    <Card>
      {collapsed ? (
        <details>
          <summary className={styles.groupHead}>
            <h2 className={styles.groupTitle}>{title}</h2>
            <span className={styles.muted}>{count} · Visa</span>
          </summary>
          {list}
        </details>
      ) : (
        <section aria-label={title}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>{title}</h2>
            <span className={styles.muted}>{count}</span>
          </div>
          {list}
        </section>
      )}
    </Card>
  )
}

function StudentRow({ row }: { row: Row }) {
  const where = [row.class_name, row.school_name].filter(Boolean).join(' · ')
  return (
    <li>
      <Link to={`/supervised-students/${row.student.id}`} className={styles.row}>
        <span className={styles.who}>
          <Avatar name={row.student.name} size="sm" />
          <span className={styles.whoText}>
            <span className={styles.name}>{row.student.name}</span>
            {where && <span className={styles.small}>{where}</span>}
          </span>
        </span>
        <span className={styles.cell}>{periodLabel(row)}</span>
        <span className={`${styles.cell} ${styles.strong}`}>
          {row.attendance_percent === null ? '–' : `${row.attendance_percent} %`}
          <span className={styles.mobileLabel}> närvaro</span>
        </span>
        <span className={styles.cell}>
          {row.status === 'upcoming' ? '–' : row.report_count}
          <span className={styles.mobileLabel}> redovisningar</span>
          {row.unread_count > 0 && <span className={styles.newBadge}>{row.unread_count} nya</span>}
        </span>
        <span className={styles.cell}>
          {row.latest_note ? (
            <span className={styles.note} data-tag={row.latest_note.tag}>
              {noteTagLabel[row.latest_note.tag]} {shortDay(row.latest_note.created_at)}
            </span>
          ) : (
            <span className={styles.small}>Inga anteckningar</span>
          )}
        </span>
        <ArrowUpRight aria-hidden="true" className={styles.arrow} />
      </Link>
    </li>
  )
}
