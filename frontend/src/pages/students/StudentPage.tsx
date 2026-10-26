import { BriefcaseBusiness, CalendarCheck, FileText, GraduationCap, MapPin, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import type { AttendanceStatus } from '../../api/attendance'
import { useSchoolTeachers } from '../../api/classes'
import {
  useSetTeachers,
  useStudent,
  useStudentAttendance,
  useStudentPlacements,
  useStudentReports,
  type Student,
} from '../../api/students'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, Card, SegmentedBar, Tag } from '../../components'
import styles from '../classes/Classes.module.css'
import { NotFound } from '../NotFound'
import { currentPlacement, periodStatus, periodText, periodWeek } from '../placements/period'
import { CheckList } from './CheckList'
import own from './StudentPage.module.css'

function shortDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Elevsidan: allt om en elev på ett ställe, dit alla klick på en elev leder.
 * Praktikplats, närvaro, redovisningar, klass och lärare (Texas, 2026-10-26).
 */
export function StudentPage() {
  const { studentId = '' } = useParams()
  const { data: user } = useCurrentUser()
  const query = useStudent(studentId)

  if (query.isPending) return <p className={styles.state}>Laddar eleven…</p>
  if (query.isError) return <NotFound what="Eleven" />

  const student = query.data
  const isAdmin = user?.role === 'school_admin'
  const isTeacher = user?.role === 'teacher'
  const schoolClass = student.classes[0]

  return (
    <div className={styles.page}>
      <header className={styles.titleRow} style={{ justifyContent: 'flex-start' }}>
        <Avatar name={student.name} size="lg" />
        <div className={styles.header}>
          <h1 className={styles.title}>{student.name}</h1>
          <p className={styles.subtitle}>
            {student.email}
            {student.school_name ? ` · ${student.school_name}` : ''}
          </p>
        </div>
        {schoolClass && (
          <Link to={`/classes/${schoolClass.id}`} className={`${styles.tagLink} ${own.classTag}`}>
            <Tag icon={<Users aria-hidden="true" />}>{schoolClass.name}</Tag>
          </Link>
        )}
      </header>

      <div className={own.grid}>
        <PlacementCard studentId={student.id} />
        <AttendanceCard studentId={student.id} />
      </div>

      {isTeacher && <ReportsCard studentId={student.id} />}

      {isAdmin ? (
        <TeachersEditor student={student} schoolId={user?.school_id} />
      ) : (
        <Card>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Lärare</h2>
          </div>
          <div className={styles.cardBody}>
            {student.teachers.length === 0 ? (
              <p className={styles.hint}>Eleven har ingen lärare kopplad.</p>
            ) : (
              <div className={styles.tags}>
                {student.teachers.map((t) => (
                  <Tag key={t.id} icon={<GraduationCap aria-hidden="true" />}>
                    {t.name}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

function PlacementCard({ studentId }: { studentId: string }) {
  const query = useStudentPlacements(studentId)
  const placements = query.data ?? []
  const current = currentPlacement(placements)
  const others = placements.filter((p) => p.id !== current?.id)

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Praktikplats</h2>
      </div>
      {query.isPending && <p className={styles.empty}>Laddar…</p>}
      {query.isSuccess && !current && (
        <p className={styles.empty}>Eleven har ingen praktikplats. Den tilldelas i klassvyn.</p>
      )}
      {current && (
        <div className={`${styles.cardBody} ${own.placement}`}>
          <p className={own.company}>
            <BriefcaseBusiness aria-hidden="true" />
            {current.workplace.name}
          </p>
          {current.workplace.address && (
            <p className={own.muted}>
              <MapPin aria-hidden="true" />
              {current.workplace.address}
            </p>
          )}
          <p className={own.muted}>
            {periodText(current.start_date, current.end_date)}
            {periodStatus(current.start_date, current.end_date) === 'active' &&
              (() => {
                const { week, weeks } = periodWeek(current.start_date, current.end_date)
                return ` · vecka ${week} av ${weeks}`
              })()}
            {periodStatus(current.start_date, current.end_date) === 'upcoming' && ' · har inte börjat'}
          </p>
          <p className={own.muted}>
            Handledare: {current.supervisor.name} ({current.supervisor.email})
          </p>
        </div>
      )}
      {others.length > 0 && (
        <ul className={styles.list}>
          {others.map((p) => (
            <li key={p.id} className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.name}>{p.workplace.name}</span>
                <span className={styles.meta}>{periodText(p.start_date, p.end_date)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

const dayText: Record<AttendanceStatus, string> = {
  present: 'Incheckad',
  absent: 'Frånvaro',
  sick: 'Sjuk',
}

function AttendanceCard({ studentId }: { studentId: string }) {
  const query = useStudentAttendance(studentId)
  const [showAll, setShowAll] = useState(false)

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Närvaro</h2>
        {query.data && (
          <span className={styles.count}>
            {shortDate(query.data.from_date)} – {shortDate(query.data.to_date)}
          </span>
        )}
      </div>
      {query.isPending && <p className={styles.empty}>Laddar…</p>}
      {query.isError && <p className={styles.empty}>Närvaron gick inte att hämta.</p>}
      {query.data && !query.data.summary.has_placement && (
        <p className={styles.empty}>Ingen närvaro att visa. Eleven har ingen praktikplats under perioden.</p>
      )}
      {query.data?.summary.has_placement &&
        (() => {
          const { summary, days } = query.data
          const away = summary.absent + summary.sick
          const total = Math.max(summary.expected_days, summary.present + away)
          const parts = [
            `${summary.present} närvarande`,
            summary.sick > 0 && `${summary.sick} sjuk`,
            summary.absent > 0 && `${summary.absent} frånvaro`,
            summary.missing > 0 && `${summary.missing} ej incheckad`,
          ].filter(Boolean)
          const shown = showAll ? days : days.slice(0, 5)
          return (
            <>
              <div className={`${styles.cardBody} ${own.attendance}`}>
                <SegmentedBar
                  present={summary.present}
                  absent={away}
                  total={total}
                  label={`${summary.present} av ${total} dagar närvarande`}
                />
                <p className={own.muted}>
                  {parts.join(' · ')} av {summary.expected_days} APL-dagar
                </p>
              </div>
              {shown.length > 0 && (
                <ul className={styles.list}>
                  {shown.map((day) => (
                    <li key={day.date} className={styles.row}>
                      <span className={styles.rowText}>
                        <span className={styles.name}>{shortDate(day.date)}</span>
                        {day.note && <span className={styles.meta}>{day.note}</span>}
                      </span>
                      <span className={`${own.status} ${own[day.status]}`}>
                        <CalendarCheck aria-hidden="true" />
                        {dayText[day.status]}
                        {day.checked_in_at &&
                          ` ${new Date(day.checked_in_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {days.length > 5 && (
                <div className={styles.cardBody}>
                  <button type="button" className={styles.textButton} onClick={() => setShowAll(!showAll)}>
                    {showAll ? 'Visa färre' : `Visa alla ${days.length} dagar`}
                  </button>
                </div>
              )}
            </>
          )
        })()}
    </Card>
  )
}

function ReportsCard({ studentId }: { studentId: string }) {
  const query = useStudentReports(studentId, true)
  const reports = query.data ?? []

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Redovisningar</h2>
        <span className={styles.count}>{reports.length}</span>
      </div>
      {query.isPending && <p className={styles.empty}>Laddar…</p>}
      {query.isSuccess && reports.length === 0 && <p className={styles.empty}>Eleven har inte lämnat någon redovisning än.</p>}
      {reports.length > 0 && (
        <ul className={styles.list}>
          {reports.map((r) => (
            <li key={r.id} className={styles.row}>
              <Link to={`/reports/${r.id}`} className={styles.rowLink}>
                <FileText aria-hidden="true" className={own.reportIcon} />
                <span className={styles.rowText}>
                  <span className={styles.name}>Redovisning {shortDate(r.due_date)}</span>
                  <span className={styles.meta}>
                    {r.class_name}
                    {r.is_late ? ' · Sen' : ''}
                    {r.comment_count > 0 ? ` · ${r.comment_count} kommentarer` : ''}
                  </span>
                </span>
              </Link>
              {!r.is_read && <span className={`${own.status} ${own.unread}`}>Oläst</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function TeachersEditor({ student, schoolId }: { student: Student; schoolId?: string | null }) {
  const saved = student.teachers.map((t) => t.id)
  const [selected, setSelected] = useState<string[]>(saved)
  const [done, setDone] = useState(false)
  const teachers = useSchoolTeachers(schoolId, true)
  const setTeachers = useSetTeachers(student.id)
  const changed = selected.length !== saved.length || selected.some((id) => !saved.includes(id))

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Lärare</h2>
        <span className={styles.count}>{student.teachers.length}</span>
      </div>
      <div className={styles.cardBody} style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <CheckList
          legend="Lärare som ser eleven och kan lägga hen i sina klasser"
          options={(teachers.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
          selected={selected}
          onChange={(next) => {
            setSelected(next)
            setDone(false)
          }}
          emptyText={teachers.isPending ? 'Hämtar lärare…' : 'Skolan har inga lärare än.'}
        />
        {setTeachers.isError && (
          <p className={styles.formError} role="alert" style={{ marginTop: 0 }}>
            {setTeachers.error.message}
          </p>
        )}
        <div className={styles.formActions} style={{ alignItems: 'center' }}>
          <Button
            variant="primary"
            disabled={!changed || setTeachers.isPending}
            onClick={() => setTeachers.mutate(selected, { onSuccess: () => setDone(true) })}
          >
            Spara lärare
          </Button>
          {done && !changed && (
            <span className={styles.formSuccess} role="status" style={{ marginTop: 0 }}>
              Sparat.
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
