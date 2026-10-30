import { ChevronLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { useStudentNotes } from '../../api/notes'
import { useSupervisedStudents } from '../../api/placements'
import { useSupervisorReports } from '../../api/reports'
import { Avatar, Card } from '../../components'
import { NotFound } from '../NotFound'
import { NoteForm, NoteItem } from '../notes/StudentNotes'
import { periodWeek } from '../placements/period'
import { longDate } from '../reports/answers'
import styles from './SupervisorStudent.module.css'

/**
 * Handledarens sida om en elev (B18/F23, Texas skiss 2026-10-30): anteckningar om eleven i
 * helhet och elevens senaste redovisningar från tiden hos handledaren.
 */
export function SupervisorStudent() {
  const { studentId = '' } = useParams()
  const students = useSupervisedStudents()
  const row = students.data?.find((s) => s.student.id === studentId)
  const notes = useStudentNotes(studentId, !!row)
  const reports = useSupervisorReports()

  if (students.isPending) return <p className={styles.state}>Laddar eleven…</p>
  if (!row) return <NotFound what="Eleven" />

  const firstName = row.student.name.split(' ')[0]
  const { week, weeks } = periodWeek(row.start_date, row.end_date)
  const latest = (reports.data ?? []).filter((r) => r.student.id === studentId).slice(0, 3)

  return (
    <div className={styles.page}>
      <Link to="/my-students" className={styles.back}>
        <ChevronLeft aria-hidden="true" /> Mina elever
      </Link>
      <header className={styles.header}>
        <Avatar name={row.student.name} size="md" />
        <div className={styles.heading}>
          <h1 className={styles.title}>{row.student.name}</h1>
          <p className={styles.muted}>
            {row.workplace.name} · vecka {week} av {weeks}
          </p>
        </div>
      </header>

      <div className={styles.columns}>
        <Card>
          <section className={styles.notes} aria-labelledby="notes-heading">
            <div>
              <h2 id="notes-heading" className={styles.sectionTitle}>
                Anteckningar om {firstName}
              </h2>
              <p className={styles.muted}>Hur det går för {firstName} i helhet, inte om en enskild dag.</p>
            </div>
            <NoteForm studentId={studentId} firstName={firstName} />
            {notes.isPending && <p className={styles.muted}>Laddar…</p>}
            {notes.isSuccess && notes.data.length === 0 && (
              <p className={styles.muted}>Du har inte skrivit några anteckningar om {firstName} än.</p>
            )}
            {(notes.data ?? []).map((note) => (
              <NoteItem key={note.id} note={note} studentId={studentId} />
            ))}
          </section>
        </Card>

        <Card>
          <section className={styles.side} aria-labelledby="latest-heading">
            <h2 id="latest-heading" className={styles.sideTitle}>
              Senaste redovisningar
            </h2>
            {reports.isSuccess && latest.length === 0 && <p className={styles.muted}>Inga redovisningar än.</p>}
            <ul className={styles.reportList}>
              {latest.map((r) => {
                const day = longDate(r.due_date)
                return (
                  <li key={r.id}>
                    <Link to={`/student-reports/${r.id}`} className={styles.reportLink}>
                      <span className={styles.reportDay}>{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                      {r.excerpt && <span className={styles.muted}>{r.excerpt.text}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
            <Link to={`/student-reports?student=${studentId}`} className={styles.more}>
              Se alla {firstName}s redovisningar
            </Link>
          </section>
        </Card>
      </div>
    </div>
  )
}
