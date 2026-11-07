import { Check, ChevronLeft, FileText, FolderKanban, MapPin, MessageSquare, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { useReview, useReviewList, type ReviewItem } from '../../api/attendance'
import { useContracts } from '../../api/contracts'
import { useStudentNotes } from '../../api/notes'
import { useProjects } from '../../api/projects'
import { useSupervisorStudent } from '../../api/students'
import { Avatar, ButtonLink, Card } from '../../components'
import { NotFound } from '../NotFound'
import { NoteForm, NoteItem } from '../notes/StudentNotes'
import { periodStatus, periodText, periodWeek } from '../placements/period'
import { AttendanceCard, ReportsSection } from '../students/StudentPage'
import { AbsenceDialog } from './AbsenceDialog'
import { absenceLabel } from './absence'
import { ScheduleCard } from './ScheduleCard'
import styles from './SupervisorStudent.module.css'
import { weekDays } from './weekDays'

/** Knappar för dagens närvaro, samma som i Närvaro. */
function TodayButtons({ item, today }: { item: ReviewItem; today: string }) {
  const review = useReview()
  const [asking, setAsking] = useState(false)
  const confirm = () => review.mutate([{ placement_id: item.placement_id, date: item.date, verdict: 'confirmed' }])
  const busy = review.isPending
  const dialog = asking && <AbsenceDialog item={item} today={today} onClose={() => setAsking(false)} />
  if (item.state === 'pending' || item.state === 'missing') {
    return (
      <span className={styles.todayButtons}>
        <button type="button" className={styles.pillButton} disabled={busy} onClick={() => setAsking(true)}>
          <X aria-hidden="true" /> Inte på plats
        </button>
        <button
          type="button"
          className={item.state === 'pending' ? styles.primaryButton : styles.pillButton}
          disabled={busy}
          onClick={confirm}
        >
          {item.state === 'pending' ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {item.state === 'pending' ? 'Bekräfta' : 'Var här i dag'}
        </button>
        {dialog}
      </span>
    )
  }
  return (
    <span className={styles.todayButtons}>
      {item.state === 'not_present' && (
        <span className={styles.muted}>
          Inte på plats{item.absence_reason && ` · ${absenceLabel[item.absence_reason]}`}
        </span>
      )}
      <button
        type="button"
        className={styles.linkButton}
        disabled={busy}
        onClick={() => (item.state === 'confirmed' ? setAsking(true) : confirm())}
      >
        {item.state === 'confirmed' ? 'Ändra till inte på plats' : 'Ändra till på plats'}
      </button>
      {dialog}
    </span>
  )
}

/**
 * Handledarens sida om en elev, i stil med lärarens elevsida (Texas skiss "Handledarens
 * elevsida", 2026-11-07): redovisningarna som läraren ser dem, närvaron under perioden,
 * praktikplatsen, projekt, kontrakt och anteckningar. Bara tiden hos handledaren syns.
 */
export function SupervisorStudent() {
  const { studentId = '' } = useParams()
  const student = useSupervisorStudent(studentId)
  const row = student.data
  const notes = useStudentNotes(studentId, !!row)
  const review = useReviewList()
  const contracts = useContracts()
  const projects = useProjects()

  if (student.isPending) return <p className={styles.state}>Laddar eleven…</p>
  if (!row) return <NotFound what="Eleven" />

  const firstName = row.student.name.split(' ')[0]
  const { week, weeks } = periodWeek(row.start_date, row.end_date)
  const active = periodStatus(row.start_date, row.end_date) === 'active'
  const today = weekDays(review.data, row.placement_id).find((d) => d.isToday)?.item
  const studentContracts = (contracts.data ?? []).filter((c) => c.student.id === studentId)
  const studentProjects = (projects.data ?? []).filter(
    (p) => !p.completed_at && p.students.some((s) => s.id === studentId),
  )
  const chips = [row.track_name, row.class_name, row.school_name].filter(Boolean)

  return (
    <div className={styles.page}>
      <Link to="/my-students" className={styles.back}>
        <ChevronLeft aria-hidden="true" /> Översikt
      </Link>
      <header className={styles.header}>
        <Avatar name={row.student.name} size="md" />
        <div className={styles.heading}>
          <h1 className={styles.title}>{row.student.name}</h1>
          <p className={styles.chips}>
            {chips.map((c) => (
              <span key={c} className={styles.chip}>
                {c}
              </span>
            ))}
            {row.teachers.length > 0 && (
              <span className={styles.muted}>Lärare: {row.teachers.map((t) => t.name).join(' och ')}</span>
            )}
          </p>
        </div>
        <ButtonLink to={`/messages?group=${row.student.id}`} icon={<MessageSquare aria-hidden="true" />}>
          Skicka meddelande
        </ButtonLink>
      </header>

      <div className={styles.columns}>
        <div className={styles.stack}>
          {today && (
            <Card>
              <section className={styles.todayCard} aria-label="Närvaro i dag">
                <span className={styles.todayLabel}>I dag</span>
                <TodayButtons item={today} today={review.data?.today ?? today.date} />
              </section>
            </Card>
          )}
          <ReportsSection studentId={studentId} supervisor />
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
          <AttendanceCard studentId={studentId} supervisor />
          <Card>
            <section className={styles.side} aria-labelledby="placement-heading">
              <h2 id="placement-heading" className={styles.sideTitle}>
                Praktikplats
              </h2>
              <div className={styles.itemText}>
                <span className={styles.itemTitle}>{row.workplace.name}</span>
                {row.workplace.address && (
                  <span className={`${styles.muted} ${styles.address}`}>
                    <MapPin aria-hidden="true" />
                    {row.workplace.address}
                  </span>
                )}
              </div>
              <div className={styles.itemText}>
                <span className={styles.muted}>Period</span>
                <span>
                  {periodText(row.start_date, row.end_date)}
                  {active && ` · vecka ${week} av ${weeks}`}
                </span>
              </div>
            </section>
          </Card>
          <ScheduleCard placementId={row.placement_id} firstName={firstName} />
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
        </div>
      </div>
    </div>
  )
}
