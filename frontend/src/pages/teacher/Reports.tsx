import { ArrowUpRight, Folder, Lock, MessageCircle } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router'

import { useClasses } from '../../api/classes'
import { useProjects } from '../../api/projects'
import { useStudents } from '../../api/students'
import {
  useMissingReports,
  useStudentReportStats,
  useTeacherReports,
  type MissingReport,
  type ReportShow,
  type TeacherReport,
} from '../../api/teacherReports'
import { Avatar, Combobox } from '../../components'
import { longDate, relativeDay, reportTitle } from '../reports/answers'
import styles from './Reports.module.css'

type Show = ReportShow | 'missing'

/** /student-history leder till Per elev, med samma filter. */
export function OldStudentHistory() {
  const [params] = useSearchParams()
  const next = new URLSearchParams({ view: 'students' })
  for (const key of ['class', 'student']) {
    const value = params.get(key)
    if (value) next.set(key, value)
  }
  return <Navigate to={`/reports?${next}`} replace />
}
const PAGE = 100

const QUICK: { id: Exclude<Show, 'all'>; label: string }[] = [
  { id: 'unread', label: 'Olästa' },
  { id: 'late', label: 'Sena' },
  { id: 'comments', label: 'Med kommentarer' },
  { id: 'private', label: 'Har privat kommentar' },
  { id: 'missing', label: 'Saknas' },
]

/**
 * Redovisningar (Texas, 2026-10-31): alla redovisningar i lärarens klasser, nyaste först,
 * med filter och snabbval. Fliken Per elev visar läget per elev. Ersätter Elevhistorik.
 */
export function Reports() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'students' ? 'students' : 'all'
  const classId = params.get('class') ?? ''
  const studentId = params.get('student') ?? ''
  const projectId = params.get('project') ?? ''
  const show = (params.get('show') ?? 'all') as Show
  const limit = Number(params.get('limit')) || PAGE

  const classes = useClasses()
  const students = useStudents()
  const projects = useProjects()

  function update(next: Record<string, string>) {
    const p = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) p.set(key, value)
      else p.delete(key)
    }
    if (!('limit' in next)) p.delete('limit')
    setParams(p, { replace: true })
  }

  const inClass = (students.data ?? []).filter((s) => !classId || s.classes.some((c) => c.id === classId))

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Redovisningar</h1>

      <div className={styles.tabs} role="group" aria-label="Visa">
        <button type="button" aria-pressed={view === 'all'} onClick={() => update({ view: '' })}>
          Alla redovisningar
        </button>
        <button type="button" aria-pressed={view === 'students'} onClick={() => update({ view: 'students' })}>
          Per elev
        </button>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterField}>
          <Combobox
            label="Klass"
            value={classId}
            onChange={(id) => update({ class: id, student: '' })}
            placeholder="Alla klasser"
            options={(classes.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
          />
        </div>
        <div className={styles.filterField}>
          <Combobox
            label="Elev"
            value={studentId}
            onChange={(id) => update({ student: id })}
            placeholder="Sök elev"
            options={inClass.map((s) => ({ id: s.id, label: s.name, description: s.classes[0]?.name }))}
          />
        </div>
        {view === 'all' && (
          <div className={styles.filterField}>
            <Combobox
              label="Projekt"
              value={projectId}
              onChange={(id) => update({ project: id, show: show === 'missing' ? '' : show })}
              placeholder="Alla projekt"
              options={(projects.data ?? []).map((p) => ({ id: p.id, label: p.name }))}
            />
          </div>
        )}
        {(classId || studentId || (view === 'all' && projectId)) && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => update({ class: '', student: '', project: '' })}
          >
            Rensa filter
          </button>
        )}
      </div>

      {view === 'all' ? (
        <AllReports
          filters={{
            classId: classId || undefined,
            studentId: studentId || undefined,
            projectId: projectId || undefined,
          }}
          show={show}
          limit={limit}
          onShow={(next) => update({ show: next === 'all' ? '' : next })}
          onMore={() => update({ limit: String(limit + PAGE) })}
        />
      ) : (
        <PerStudent classId={classId || undefined} studentId={studentId || undefined} />
      )}
    </div>
  )
}

function AllReports({
  filters,
  show,
  limit,
  onShow,
  onMore,
}: {
  filters: { classId?: string; studentId?: string; projectId?: string }
  show: Show
  limit: number
  onShow: (show: Show) => void
  onMore: () => void
}) {
  const isMissing = show === 'missing'
  const reports = useTeacherReports({ ...filters, show: isMissing ? 'all' : show, limit })
  const missing = useMissingReports(filters, isMissing)
  const counts = reports.data?.counts
  // Saknade redovisningar hör inte till ett projekt.
  const quick = QUICK.filter((q) => q.id !== 'missing' || !filters.projectId)

  return (
    <>
      <div className={styles.quick} role="group" aria-label="Snabbval">
        {quick.map((q) => {
          const count = counts?.[q.id]
          return (
            <button
              key={q.id}
              type="button"
              className={styles.quickChip}
              data-tone={q.id === 'missing' ? 'attention' : undefined}
              aria-pressed={show === q.id}
              onClick={() => onShow(show === q.id ? 'all' : q.id)}
            >
              {q.label}
              {count !== undefined && <span className={styles.quickCount}>{count}</span>}
            </button>
          )
        })}
      </div>

      {isMissing ? (
        <MissingList query={missing} />
      ) : reports.isPending ? (
        <p className={styles.state}>Laddar redovisningar…</p>
      ) : reports.isError ? (
        <p className={styles.state}>Redovisningarna gick inte att hämta. Ladda om sidan.</p>
      ) : reports.data.reports.length === 0 ? (
        <p className={styles.state}>
          {show === 'all' ? 'Inga inskickade redovisningar än.' : 'Inga redovisningar med det här valet.'}
        </p>
      ) : (
        <>
          {groupByDay(reports.data.reports, (r) => localDay(r.submitted_at)).map(([day, items]) => (
            <section key={day} className={styles.group} aria-label={dayLabel(day)}>
              <h2 className={styles.groupTitle}>{dayLabel(day)}</h2>
              <ul>
                {items.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </ul>
            </section>
          ))}
          {reports.data.has_more && (
            <button type="button" className={styles.more} onClick={onMore} disabled={reports.isFetching}>
              Visa fler
            </button>
          )}
        </>
      )}
    </>
  )
}

function ReportRow({ report }: { report: TeacherReport }) {
  const time = new Date(report.submitted_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  return (
    <li>
      <Link to={`/reports/${report.id}`} className={styles.reportRow} data-unread={!report.is_read || undefined}>
        <span className={styles.unreadDot} aria-hidden="true" />
        <Avatar name={report.student.name} />
        <span className={styles.reportText}>
          <span className={styles.reportHead}>
            <span className={styles.name}>
              {report.student.name}
              {!report.is_read && <span className="sr-only"> (oläst)</span>}
            </span>
            <span className={styles.meta}>
              {reportTitle(report.due_date)} · {report.school_class.name}
            </span>
          </span>
          {report.excerpt && (
            <span className={styles.excerpt}>
              <span className={styles.question}>{report.excerpt.question}</span> {report.excerpt.text}
            </span>
          )}
          {(report.project || report.is_late || report.comment_count > 0) && (
            <span className={styles.badges}>
              {report.project && (
                <span className={styles.badge}>
                  <Folder aria-hidden="true" /> {report.project.name}
                </span>
              )}
              {report.is_late && (
                <span className={styles.badge} data-tone="butter">
                  Sen
                </span>
              )}
              {report.comment_count > 0 && (
                <span className={styles.badge} aria-label={`${report.comment_count} kommentarer`}>
                  <MessageCircle aria-hidden="true" /> {report.comment_count}
                </span>
              )}
              {report.has_private_comment && (
                <span className={styles.badge} data-tone="primary">
                  <Lock aria-hidden="true" /> Privat
                </span>
              )}
            </span>
          )}
        </span>
        <span className={styles.time}>{time}</span>
      </Link>
    </li>
  )
}

function MissingList({ query }: { query: ReturnType<typeof useMissingReports> }) {
  if (query.isPending) return <p className={styles.state}>Laddar…</p>
  if (query.isError) return <p className={styles.state}>Det gick inte att hämta. Ladda om sidan.</p>
  if (query.data.length === 0)
    return <p className={styles.state}>Inga redovisningar saknas de senaste fyra veckorna.</p>
  return (
    <>
      <p className={styles.hint}>Redovisningsdagar de senaste fyra veckorna där eleven inte har redovisat.</p>
      {groupByDay(query.data, (m) => m.due_date).map(([day, items]) => (
        <section key={day} className={styles.group} aria-label={longDate(day)}>
          <h2 className={styles.groupTitle}>{capitalize(longDate(day))}</h2>
          <ul>
            {items.map((m) => (
              <MissingRow key={`${m.student.id}-${m.school_class.id}`} item={m} />
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function MissingRow({ item }: { item: MissingReport }) {
  return (
    <li>
      <Link to={`/students/${item.student.id}`} className={styles.reportRow}>
        <span className={styles.unreadDot} aria-hidden="true" />
        <Avatar name={item.student.name} />
        <span className={styles.reportText}>
          <span className={styles.reportHead}>
            <span className={styles.name}>{item.student.name}</span>
            <span className={styles.meta}>{item.school_class.name}</span>
          </span>
          <span className={styles.missingText}>{reportTitle(item.due_date)} saknas</span>
        </span>
        <ArrowUpRight aria-hidden="true" className={styles.arrow} />
      </Link>
    </li>
  )
}

function PerStudent({ classId, studentId }: { classId?: string; studentId?: string }) {
  const stats = useStudentReportStats(classId)
  const students = useStudents()
  const byId = new Map((students.data ?? []).map((s) => [s.id, s]))
  const rows = (stats.data ?? []).filter((r) => !studentId || r.student.id === studentId)

  if (stats.isPending) return <p className={styles.state}>Laddar elever…</p>
  if (stats.isError) return <p className={styles.state}>Eleverna gick inte att hämta. Ladda om sidan.</p>
  if (rows.length === 0) return <p className={styles.state}>Inga elever att visa.</p>

  const groups = groupByDay(rows, (r) => r.school_class.name)
  return groups.map(([className, items]) => (
    <section key={className} className={styles.group} aria-label={className}>
      <h2 className={styles.classTitle}>
        {className} <span className={styles.classCount}>{items.length} elever</span>
      </h2>
      <div className={styles.table} role="table" aria-label={`Elever i ${className}`}>
        <div className={styles.tableHead} role="row">
          <span role="columnheader">Elev</span>
          <span role="columnheader">Senaste redovisning</span>
          <span role="columnheader">Olästa</span>
          <span role="columnheader">Saknas</span>
          <span role="columnheader">Projekt</span>
        </div>
        {items.map((row) => {
          const student = byId.get(row.student.id)
          return (
            <Link key={row.student.id} to={`/students/${row.student.id}`} className={styles.tableRow} role="row">
              <span className={styles.studentCell} role="cell">
                <Avatar name={row.student.name} />
                <span className={styles.reportText}>
                  <span className={styles.name}>{row.student.name}</span>
                  <span className={styles.meta}>{student?.workplace?.name ?? 'Ingen praktikplats'}</span>
                </span>
              </span>
              <span role="cell" data-label="Senaste redovisning">
                {row.last_submitted_at ? relativeDay(localDay(row.last_submitted_at)) : 'Ingen än'}
              </span>
              <span role="cell" data-label="Olästa">
                {row.unread ? (
                  <span className={styles.count}>
                    {row.unread} {row.unread === 1 ? 'oläst' : 'olästa'}
                  </span>
                ) : (
                  <Dash />
                )}
              </span>
              <span role="cell" data-label="Saknas">
                {row.missing ? (
                  <span className={styles.count} data-tone="attention">
                    {row.missing} saknas
                  </span>
                ) : (
                  <Dash />
                )}
              </span>
              <span role="cell" data-label="Projekt">
                {student?.project_count ?? 0}
              </span>
              <ArrowUpRight aria-hidden="true" className={styles.arrow} />
            </Link>
          )
        })}
      </div>
    </section>
  ))
}

function Dash() {
  return (
    <span className={styles.dash} aria-label="Inga">
      –
    </span>
  )
}

function groupByDay<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    groups.set(k, [...(groups.get(k) ?? []), item])
  }
  return [...groups]
}

/** Dagen i lokal tid som "2026-10-30". */
function localDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "I dag · fredag 30 oktober". */
function dayLabel(day: string): string {
  const relative = relativeDay(day)
  return relative === 'I dag' || relative === 'I går' ? `${relative} · ${longDate(day)}` : capitalize(longDate(day))
}
