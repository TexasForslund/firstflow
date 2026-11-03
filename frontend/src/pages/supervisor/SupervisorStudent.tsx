import { Check, ChevronLeft, FileText, FolderKanban, MessageSquare, Plus, X } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { useReview, useReviewList, type ReviewItem } from '../../api/attendance'
import { useContracts } from '../../api/contracts'
import { useStudentNotes } from '../../api/notes'
import { useProjects } from '../../api/projects'
import { useSupervisedStudents } from '../../api/placements'
import { useSupervisorReports } from '../../api/reports'
import { Avatar, ButtonLink, Card } from '../../components'
import { NotFound } from '../NotFound'
import { NoteForm, NoteItem } from '../notes/StudentNotes'
import { periodWeek } from '../placements/period'
import { longDate } from '../reports/answers'
import styles from './SupervisorStudent.module.css'
import { WeekDots } from './WeekDots'
import { weekDays } from './weekDays'

/** Knappar för dagens närvaro, samma som i Närvaro. */
function TodayButtons({ item }: { item: ReviewItem }) {
  const review = useReview()
  const send = (verdict: 'confirmed' | 'not_present') =>
    review.mutate([{ placement_id: item.placement_id, date: item.date, verdict }])
  const busy = review.isPending
  if (item.state === 'pending') {
    return (
      <span className={styles.todayButtons}>
        <button type="button" className={styles.pillButton} disabled={busy} onClick={() => send('not_present')}>
          <X aria-hidden="true" /> Inte på plats
        </button>
        <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => send('confirmed')}>
          <Check aria-hidden="true" /> Bekräfta
        </button>
      </span>
    )
  }
  if (item.state === 'missing') {
    return (
      <span className={styles.todayButtons}>
        <button type="button" className={styles.pillButton} disabled={busy} onClick={() => send('confirmed')}>
          <Plus aria-hidden="true" /> Var här i dag
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      className={styles.linkButton}
      disabled={busy}
      onClick={() => send(item.state === 'confirmed' ? 'not_present' : 'confirmed')}
    >
      {item.state === 'confirmed' ? 'Ändra till inte på plats' : 'Ändra till på plats'}
    </button>
  )
}

/**
 * Handledarens sida om en elev (Texas skiss "Handledarens vy, del 2", 2026-11-03): veckans
 * närvaro, anteckningar, kontrakt, projekt och de senaste redovisningarna.
 */
export function SupervisorStudent() {
  const { studentId = '' } = useParams()
  const students = useSupervisedStudents()
  const row = students.data?.find((s) => s.student.id === studentId)
  const notes = useStudentNotes(studentId, !!row)
  const reports = useSupervisorReports()
  const review = useReviewList()
  const contracts = useContracts()
  const projects = useProjects()

  if (students.isPending) return <p className={styles.state}>Laddar eleven…</p>
  if (!row) return <NotFound what="Eleven" />

  const firstName = row.student.name.split(' ')[0]
  const { week, weeks } = periodWeek(row.start_date, row.end_date)
  const latest = (reports.data ?? []).filter((r) => r.student.id === studentId).slice(0, 3)
  const days = weekDays(review.data, row.placement_id)
  const today = days.find((d) => d.isToday)?.item
  const present = days.filter((d) => d.item?.state === 'confirmed' && !d.isToday).length
  // Dagar före i dag. I dag räknas inte förrän dagen är bekräftad.
  const passed = days.filter((d) => d.item && !d.future && !d.isToday).length
  const studentContracts = (contracts.data ?? []).filter((c) => c.student.id === studentId)
  const studentProjects = (projects.data ?? []).filter(
    (p) => !p.completed_at && p.students.some((s) => s.id === studentId),
  )
  const teachers = row.teachers ?? []

  return (
    <div className={styles.page}>
      <Link to="/my-students" className={styles.back}>
        <ChevronLeft aria-hidden="true" /> Översikt
      </Link>
      <header className={styles.header}>
        <Avatar name={row.student.name} size="md" />
        <div className={styles.heading}>
          <h1 className={styles.title}>{row.student.name}</h1>
          <p className={styles.muted}>
            {row.workplace.name} · vecka {week} av {weeks}
            {teachers.length > 0 && ` · lärare ${teachers.map((t) => t.name).join(' och ')}`}
          </p>
        </div>
        <ButtonLink to={`/messages?group=${row.student.id}`} icon={<MessageSquare aria-hidden="true" />}>
          Skicka meddelande
        </ButtonLink>
      </header>

      <div className={styles.columns}>
        <div className={styles.stack}>
          <Card>
            <section className={styles.side} aria-labelledby="week-heading">
              <h2 id="week-heading" className={styles.sectionTitle}>
                Närvaro den här veckan
              </h2>
              <div className={styles.weekRow}>
                <WeekDots days={days} />
                {passed > 0 && (
                  <span className={styles.muted}>
                    {present} av {passed} {passed === 1 ? 'dag' : 'dagar'} på plats
                  </span>
                )}
              </div>
              {today ? (
                <div className={styles.todayRow}>
                  <span className={styles.muted}>I dag:</span>
                  <TodayButtons item={today} />
                </div>
              ) : (
                review.isSuccess && <p className={styles.muted}>{firstName} har ingen APL i dag.</p>
              )}
            </section>
          </Card>
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
        </div>

        <div className={styles.stack}>
          {studentContracts.length > 0 && (
            <Card>
              <section className={styles.side} aria-labelledby="contract-heading">
                <h2 id="contract-heading" className={styles.sideTitle}>
                  Kontrakt
                </h2>
                {studentContracts.map((c) => (
                  <Link key={c.id} to={`/contracts/${c.id}`} className={styles.item}>
                    <span className={styles.itemIcon} data-tone="sky">
                      <FileText aria-hidden="true" />
                    </span>
                    <span className={styles.itemText}>
                      <span className={styles.itemTitle}>{c.title}</span>
                      <span className={styles.muted}>
                        {c.my_turn
                          ? 'Väntar på din signatur'
                          : c.status === 'signed'
                            ? 'Signerat av alla'
                            : 'Väntar på andra'}
                      </span>
                    </span>
                    {c.my_turn && <span className={styles.primaryButton}>Signera</span>}
                  </Link>
                ))}
              </section>
            </Card>
          )}
          {studentProjects.length > 0 && (
            <Card>
              <section className={styles.side} aria-labelledby="project-heading">
                <h2 id="project-heading" className={styles.sideTitle}>
                  Projekt
                </h2>
                {studentProjects.map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className={styles.item}>
                    <span className={styles.itemIcon} data-tone="butter">
                      <FolderKanban aria-hidden="true" />
                    </span>
                    <span className={styles.itemText}>
                      <span className={styles.itemTitle}>{p.name}</span>
                      <span className={styles.muted}>
                        {[
                          p.deadline &&
                            `Klart ${new Date(p.deadline).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`,
                          `${p.students.length} ${p.students.length === 1 ? 'elev' : 'elever'}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </Link>
                ))}
              </section>
            </Card>
          )}
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
    </div>
  )
}
