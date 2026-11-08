import { ChevronLeft, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { useGradeBasis, type GoalOverview, type GradeSubject } from '../../api/gradeBasis'
import { useStudentPlacements } from '../../api/students'
import { Button, StarRating } from '../../components'
import { longDate } from '../reports/answers'
import styles from './GradeBasis.module.css'

/**
 * Underlag inför betyg (idé 13 steg 8, Texas skiss 2026-11-08). Öppnas med Exportera på
 * elevsidan. Målen per ämne med elevens underlag, och Skolverkets betygskriterier som stöd.
 * Firstflow föreslår aldrig ett betyg. "Skriv ut eller spara som PDF" använder webbläsarens
 * utskrift.
 */
export function GradeBasis() {
  const { studentId = '' } = useParams()
  const query = useGradeBasis(studentId)
  const placements = useStudentPlacements(studentId)
  const [chosen, setChosen] = useState<string | null>(null)
  const [today] = useState(() =>
    new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }),
  )

  if (query.isPending) return <p className={styles.state}>Laddar underlaget…</p>
  if (query.isError)
    return <p className={styles.state}>Underlaget finns inte, eller så har du inte tillgång till det.</p>
  const basis = query.data
  const placement = [...(placements.data ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
  const facts = [
    basis.class_name,
    basis.track_name,
    placement && `APL ${longDate(placement.start_date)} – ${longDate(placement.end_date)}`,
    placement?.workplace.name,
  ].filter(Boolean)
  const subject = basis.subjects.find((s) => s.title === chosen)
  const shown = subject ? [subject] : basis.subjects

  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link to={`/students/${studentId}`}>
          <ChevronLeft aria-hidden="true" /> {basis.student_name}
        </Link>
      </p>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Underlag inför betyg</h1>
          <p className={styles.muted}>
            {basis.student_name}
            {facts.length > 0 && ` · ${facts.join(' · ')}`}
          </p>
        </div>
        <Button variant="primary" icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>
          Skriv ut eller spara som PDF
        </Button>
      </header>

      {basis.subjects.length > 1 && (
        <div role="group" aria-label="Ämne" className={styles.subjects}>
          {basis.subjects.map((s) => (
            <button
              key={s.title}
              type="button"
              className={styles.subjectButton}
              aria-pressed={subject?.title === s.title}
              onClick={() => setChosen(s.title)}
            >
              {s.title}
            </button>
          ))}
          <button
            type="button"
            className={styles.subjectButton}
            aria-pressed={!subject}
            onClick={() => setChosen(null)}
          >
            Alla ämnen
          </button>
        </div>
      )}

      {basis.subjects.length === 0 && (
        <p className={styles.state}>
          Klassen har inga mål från läroplanen än. Läraren väljer dem under klassens flik Läroplan.
        </p>
      )}

      {shown.map((s) => (
        <SubjectBasis key={s.title} subject={s} studentId={studentId} />
      ))}

      {basis.other_goals.length > 0 && !subject && (
        <section className={styles.box} aria-labelledby="other-goals">
          <h2 id="other-goals" className={styles.boxTitle}>
            Andra mål, utan koppling till läroplanen
          </h2>
          <GoalList goals={basis.other_goals} studentId={studentId} />
        </section>
      )}

      {basis.comments.length > 0 && (
        <section className={styles.box} aria-labelledby="basis-comments">
          <h2 id="basis-comments" className={styles.boxTitle}>
            Från handledaren och läraren
          </h2>
          <ul className={styles.comments}>
            {basis.comments.map((c, i) => (
              <li key={i}>
                <strong>{c.author_name}</strong>, {c.author_role.toLowerCase()}, om {c.project_name}: ”{c.body}”
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.footer}>Utskrivet {today}. Underlaget är hämtat ur Firstflow. Läraren sätter betyget.</p>
    </div>
  )
}

function SubjectBasis({ subject, studentId }: { subject: GradeSubject; studentId: string }) {
  const covered = subject.goals.filter((g) => g.count > 0 || g.projects.length > 0).length
  return (
    <div className={styles.columns}>
      <section className={styles.box} aria-labelledby={`subject-${subject.title}`}>
        <div className={styles.boxHead}>
          <h2 id={`subject-${subject.title}`} className={styles.boxTitle}>
            {subject.title}
          </h2>
          <span className={styles.muted}>
            {covered} av {subject.goals.length} mål har underlag
          </span>
        </div>
        <GoalList goals={subject.goals} studentId={studentId} />
      </section>
      <aside className={styles.box} aria-labelledby={`criteria-${subject.title}`}>
        <h2 id={`criteria-${subject.title}`} className={styles.boxTitle}>
          Betygskriterier, som stöd
        </h2>
        <p className={styles.muted}>Från Skolverket. Firstflow föreslår inget betyg. Du sätter betyget.</p>
        {subject.criteria_missing && (
          <p className={styles.muted}>Kriterierna gick inte att hämta från Skolverket just nu.</p>
        )}
        {subject.criteria.map((c) => (
          <div key={c.grade} className={styles.criterion}>
            <span className={styles.grade}>{c.grade}</span>
            <div className={styles.criterionText}>
              {c.paragraphs.map((p, i) => (
                <p key={i}>
                  {p.map((part, j) =>
                    part.bold ? <strong key={j}>{part.text}</strong> : <span key={j}>{part.text}</span>,
                  )}
                </p>
              ))}
            </div>
          </div>
        ))}
      </aside>
    </div>
  )
}

function GoalList({ goals, studentId }: { goals: GoalOverview[]; studentId: string }) {
  return (
    <ul className={styles.goals}>
      {goals.map((g) => {
        const missing = g.count === 0 && g.projects.length === 0
        return (
          <li key={g.goal.id} className={styles.goal} data-missing={missing ? '' : undefined}>
            <div className={styles.goalHead}>
              <span className={styles.goalName}>{g.goal.name}</span>
              <span className={styles.pills}>
                {missing && <span className={styles.pillMissing}>Inget underlag</span>}
                {g.count > 0 && (
                  <span className={styles.pillReports}>
                    {g.count} {g.count === 1 ? 'redovisning' : 'redovisningar'}
                  </span>
                )}
                {g.projects.length > 0 && <span className={styles.pillProjects}>{g.projects.length} projekt</span>}
                {g.claimed && <span className={styles.pillClaimed}>Eleven: visade det</span>}
              </span>
            </div>
            {g.goal.curriculum && <p className={styles.muted}>Centralt innehåll: ”{g.goal.curriculum}”</p>}
            {g.evidence.map((e) => (
              <p key={e.report_id} className={styles.evidence}>
                <Link to={`/reports/${e.report_id}`} className={styles.date}>
                  {longDate(e.date)}
                </Link>{' '}
                {e.follow_up ? `”${e.follow_up.text}”` : `${e.question} ${e.answer}`}
              </p>
            ))}
            {g.projects.map((p) => (
              <p key={p.id} className={styles.evidence}>
                <strong>Projekt:</strong> <Link to={`/projects/${p.id}?elev=${studentId}`}>{p.name}</Link>
                {p.rating && <StarRating value={p.rating} label="Hur projektet gick" />}
                {p.best && <span className={styles.muted}> ”{p.best}”</span>}
              </p>
            ))}
          </li>
        )
      })}
    </ul>
  )
}
