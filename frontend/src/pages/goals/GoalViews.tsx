import { Target } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useProjectGoals, useStudentGoals, type GoalEvidence } from '../../api/goals'
import { longDate } from '../reports/answers'
import styles from './GoalViews.module.css'

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function day(iso: string) {
  const text = longDate(iso)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Redovisningarna som visar ett mål, med svaret på följdfrågan (Texas, 2026-10-30). */
export function EvidenceList({ items, reportPath }: { items: GoalEvidence[]; reportPath: (id: string) => string }) {
  return (
    <ul className={styles.evidence}>
      {items.map((item) => (
        <li key={item.report_id}>
          <Link to={reportPath(item.report_id)} className={styles.evidenceRow}>
            <span className={styles.evidenceDay}>{day(item.date)}</span>
            {item.follow_up ? (
              <span className={styles.followUp}>
                <span className={styles.muted}>{item.follow_up.question}</span>
                <span>”{item.follow_up.text}”</span>
              </span>
            ) : (
              <span className={styles.muted}>Ingen följdfråga</span>
            )}
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
}: {
  projectId: string
  reportPath: (id: string) => string
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
            Mål i projektet
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
                  {g.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => (
              <tr key={s.id}>
                <th scope="row" className={styles.studentCol}>
                  {s.name}
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

/** Elevens underlag per mål på elevsidan (idé 10). */
export function StudentGoalsCard({ studentId }: { studentId: string }) {
  const query = useStudentGoals(studentId)
  const [open, setOpen] = useState<string | null>(null)
  const goals = query.data ?? []
  if (query.isSuccess && goals.length === 0) return null
  return (
    <section className={styles.card} aria-labelledby="student-goals-title">
      <div className={styles.head}>
        <span className={styles.iconBox}>
          <Target aria-hidden="true" />
        </span>
        <h2 id="student-goals-title" className={styles.title}>
          Mål
        </h2>
      </div>
      {query.isPending && <p className={styles.muted}>Laddar…</p>}
      <ul className={styles.goalList}>
        {goals.map((g) => (
          <li key={g.goal.id}>
            <button
              type="button"
              className={styles.goalRow}
              aria-expanded={open === g.goal.id}
              onClick={() => setOpen(open === g.goal.id ? null : g.goal.id)}
            >
              <span className={styles.goalName}>{g.goal.name}</span>
              <span className={styles.muted}>{plural(g.count, 'gång', 'gånger')}</span>
            </button>
            {open === g.goal.id && (
              <div className={styles.goalDetail}>
                {g.goal.curriculum && <p className={styles.muted}>{g.goal.curriculum}</p>}
                <EvidenceList items={g.evidence} reportPath={(id) => `/reports/${id}`} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
