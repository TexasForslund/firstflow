import { ChevronDown, Target } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { HelpPopover, StarRating } from '../../components'
import { useProjectGoals, useStudentGoalsOverview, type GoalEvidence } from '../../api/goals'
import { longDate } from '../reports/answers'
import styles from './GoalViews.module.css'

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function day(iso: string) {
  const text = longDate(iso)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Redovisningarna som visar ett mål: frågan och svaret, och följdfrågan om det finns (Texas,
 * 2026-10-30). */
export function EvidenceList({ items, reportPath }: { items: GoalEvidence[]; reportPath: (id: string) => string }) {
  return (
    <ul className={styles.evidence}>
      {items.map((item) => (
        <li key={item.report_id}>
          <Link to={reportPath(item.report_id)} className={styles.evidenceRow}>
            <span className={styles.evidenceDay}>{day(item.date)}</span>
            <span className={styles.followUp}>
              <span>
                <span className={styles.muted}>{item.question}</span> <strong>{item.answer}</strong>
              </span>
              {item.follow_up && (
                <>
                  <span className={styles.muted}>{item.follow_up.question}</span>
                  <span>”{item.follow_up.text}”</span>
                </>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Tabell med projektets mål och hur många gånger varje elev har visat dem (idé 10). */
export function ProjectGoalsTable({
  projectId,
  reportPath,
  onStudent,
}: {
  projectId: string
  reportPath: (id: string) => string
  /** Klick på elevens namn väljer eleven på projektsidan. */
  onStudent?: (studentId: string) => void
}) {
  const query = useProjectGoals(projectId)
  const [open, setOpen] = useState<{ goalId: string; studentId: string } | null>(null)
  const data = query.data
  if (!data || data.goals.length === 0 || data.students.length === 0) return null
  const cell = (goalId: string, studentId: string) =>
    data.cells.find((c) => c.goal_id === goalId && c.student_id === studentId)
  const selected = open && cell(open.goalId, open.studentId)
  const selectedGoal = open && data.goals.find((g) => g.id === open.goalId)
  const selectedStudent = open && data.students.find((s) => s.id === open.studentId)

  return (
    <section className={styles.card} aria-labelledby="project-goals-title">
      <div className={styles.head}>
        <span className={styles.iconBox}>
          <Target aria-hidden="true" />
        </span>
        <div>
          <h2 id="project-goals-title" className={styles.title}>
            Mål i projektet <HelpPopover topic="goals" />
          </h2>
          <p className={styles.muted}>
            Hur många gånger varje elev har visat målet i redovisningar i projektet. Streckad ruta = inget underlag än.
          </p>
        </div>
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.studentCol}>
                Elev
              </th>
              {data.goals.map((g) => (
                <th key={g.id} scope="col" title={g.curriculum ?? undefined}>
                  {g.group && <span className={styles.goalGroup}>{g.group}</span>}
                  {g.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => (
              <tr key={s.id}>
                <th scope="row" className={styles.studentCol}>
                  {onStudent ? (
                    <button type="button" className={styles.studentLink} onClick={() => onStudent(s.id)}>
                      {s.name}
                    </button>
                  ) : (
                    s.name
                  )}
                </th>
                {data.goals.map((g) => {
                  const c = cell(g.id, s.id)
                  const count = c?.count ?? 0
                  const isOpen = open?.goalId === g.id && open?.studentId === s.id
                  return (
                    <td key={g.id}>
                      {count === 0 ? (
                        <span className={styles.zero} aria-label={`${s.name}, ${g.name}: inget underlag`}>
                          0
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.count}
                          data-strong={count >= 4 ? '' : undefined}
                          aria-pressed={isOpen}
                          aria-label={`${s.name}, ${g.name}: ${plural(count, 'gång', 'gånger')}`}
                          onClick={() => setOpen(isOpen ? null : { goalId: g.id, studentId: s.id })}
                        >
                          {count}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && selectedGoal && selectedStudent && (
        <div className={styles.detail} aria-live="polite">
          <p className={styles.detailTitle}>
            {selectedStudent.name} · {selectedGoal.name} · {plural(selected.count, 'gång', 'gånger')}
          </p>
          {selectedGoal.curriculum && <p className={styles.muted}>{selectedGoal.curriculum}</p>}
          <EvidenceList items={selected.evidence} reportPath={reportPath} />
        </div>
      )}
    </section>
  )
}

/**
 * En elevs mål i ett projekt: läroplanstexten, hur många gånger eleven har visat målet och i
 * vilka redovisningar. Mål utan underlag syns tydligt (Texas skiss, 2026-11-07).
 */
export function StudentProjectGoals({
  projectId,
  studentId,
  firstName,
  reportPath,
  claimed = [],
}: {
  projectId: string
  studentId: string
  firstName: string
  reportPath: (id: string) => string
  /** Målen eleven själv tycker att den visade, från sammanfattningen (idé 12:6). */
  claimed?: string[]
}) {
  const query = useProjectGoals(projectId)
  const [open, setOpen] = useState<string | null>(null)
  const data = query.data
  if (!data || data.goals.length === 0) return null
  return (
    <section className={styles.card} aria-labelledby="student-project-goals-title">
      <div className={styles.head}>
        <span className={styles.iconBox}>
          <Target aria-hidden="true" />
        </span>
        <h2 id="student-project-goals-title" className={styles.title}>
          {firstName}s mål <HelpPopover topic="goals" />
        </h2>
      </div>
      <ul className={styles.goalList}>
        {data.goals.map((g) => {
          const cell = data.cells.find((c) => c.goal_id === g.id && c.student_id === studentId)
          const count = cell?.count ?? 0
          return (
            <li key={g.id}>
              <div className={styles.projectGoal}>
                {count === 0 ? (
                  <span className={styles.zero}>0</span>
                ) : (
                  <span className={styles.count} data-strong={count >= 4 ? '' : undefined}>
                    {count}
                  </span>
                )}
                <span className={styles.projectGoalText}>
                  <span className={styles.goalName}>{g.name}</span>
                  {g.curriculum && <span className={styles.muted}>Läroplanen: {g.curriculum}</span>}
                </span>
                {claimed.includes(g.id) && <span className={styles.claimed}>{firstName}: jag visade det</span>}
                {count === 0 ? (
                  <span className={styles.muted}>Inget underlag än</span>
                ) : (
                  <button
                    type="button"
                    className={styles.linkButton}
                    aria-expanded={open === g.id}
                    onClick={() => setOpen(open === g.id ? null : g.id)}
                  >
                    {open === g.id ? 'Dölj' : 'Visa redovisningar'}
                  </button>
                )}
              </div>
              {open === g.id && cell && (
                <div className={styles.goalDetail}>
                  <EvidenceList items={cell.evidence} reportPath={reportPath} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Elevens mål på elevsidan, ordnade efter ämne och nivå (idé 13 steg 7, Texas skiss
 * 2026-11-08). Alla klassens mål syns, även de utan underlag, som är gula. Varje mål visar
 * redovisningarna, projekten och vad eleven själv tycker.
 */
export function StudentGoalsCard({ studentId, firstName }: { studentId: string; firstName: string }) {
  const query = useStudentGoalsOverview(studentId)
  const [open, setOpen] = useState<string | null>(null)
  const groups = query.data ?? []
  if (query.isSuccess && groups.length === 0) return null
  return (
    <section className={styles.card} aria-labelledby="student-goals-title">
      <div className={styles.head}>
        <span className={styles.iconBox}>
          <Target aria-hidden="true" />
        </span>
        <div>
          <h2 id="student-goals-title" className={styles.title}>
            Mål från läroplanen <HelpPopover topic="goals" />
          </h2>
          <p className={styles.muted}>
            Varje mål visar redovisningarna och projekten som visar det, och vad {firstName} själv tycker.
          </p>
        </div>
      </div>
      {query.isPending && <p className={styles.muted}>Laddar…</p>}
      {groups.map((group) => {
        const covered = group.goals.filter((g) => g.count > 0 || g.projects.length > 0).length
        const linked = group.title !== 'Utan koppling'
        return (
          <section key={group.title} className={styles.subject} aria-label={group.title}>
            <div className={styles.subjectHead}>
              <h3 className={styles.subjectTitle}>{group.title}</h3>
              {linked && (
                <span className={styles.coverage}>
                  <span className={styles.coverageBar} aria-hidden="true">
                    <span style={{ width: `${(100 * covered) / group.goals.length}%` }} />
                  </span>
                  {covered} av {group.goals.length} mål har underlag
                </span>
              )}
            </div>
            <ul className={styles.overviewList}>
              {group.goals.map((g) => {
                const missing = g.count === 0 && g.projects.length === 0
                const isOpen = open === g.goal.id
                return (
                  <li key={g.goal.id} className={styles.overviewItem} data-missing={missing ? '' : undefined}>
                    <button
                      type="button"
                      className={styles.overviewRow}
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : g.goal.id)}
                    >
                      <span className={styles.overviewText}>
                        <span className={styles.goalName}>{g.goal.name}</span>
                        {g.goal.curriculum && <span className={styles.quote}>”{g.goal.curriculum}”</span>}
                      </span>
                      <span className={styles.pills}>
                        {missing && <span className={styles.pillMissing}>Inget underlag än</span>}
                        {g.count > 0 && (
                          <span className={styles.pillReports}>{plural(g.count, 'redovisning', 'redovisningar')}</span>
                        )}
                        {g.projects.length > 0 && (
                          <span className={styles.pillProjects}>{g.projects.length} projekt</span>
                        )}
                        {g.claimed && <span className={styles.pillClaimed}>{firstName}: visade det</span>}
                      </span>
                      <ChevronDown aria-hidden="true" className={styles.chevron} />
                    </button>
                    {isOpen && (
                      <div className={styles.goalDetail}>
                        {g.count > 0 && (
                          <>
                            <h4 className={styles.detailTitle}>Redovisningar</h4>
                            <EvidenceList items={g.evidence} reportPath={(id) => `/reports/${id}`} />
                          </>
                        )}
                        {g.projects.length > 0 && (
                          <>
                            <h4 className={styles.detailTitle}>Projekt</h4>
                            <ul className={styles.overviewProjects}>
                              {g.projects.map((p) => (
                                <li key={p.id}>
                                  <Link to={`/projects/${p.id}?elev=${studentId}`} className={styles.overviewProject}>
                                    <span className={styles.overviewText}>
                                      <span className={styles.goalName}>{p.name}</span>
                                      <span className={styles.muted}>
                                        {p.best ? `Sammanfattning: ”${p.best}”` : 'Ingen sammanfattning än'}
                                      </span>
                                    </span>
                                    {p.rating && <StarRating value={p.rating} label="Hur projektet gick" />}
                                    {p.claimed && <span className={styles.pillClaimed}>{firstName}: visade det</span>}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {missing && (
                          <p className={styles.muted}>
                            Inget underlag än. Lägg till en fråga från målet under klassens Frågor, eller koppla målet
                            till ett projekt.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </section>
  )
}
