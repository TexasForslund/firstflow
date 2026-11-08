import { Check, CornerDownRight, Plus, Sparkles, Target } from 'lucide-react'

import type { Question } from '../../../api/forms'
import { goalGroups, type Goal } from '../../../api/goals'
import { Button } from '../../../components'
import { goalTemplates } from './goalTemplates'
import styles from './Suggestions.module.css'
import { newQuestion, unusedGoals } from './questionTypes'

type Basic = { title: string; type: 'long_text' | 'rating'; label: string }

/** Grundfrågor som passar varje vecka, utan mål (Texas skiss "Enklare frågor", 2026-11-08). */
const BASIC: Basic[] = [
  { title: 'Vad har du gjort den här veckan?', type: 'long_text', label: 'Fritext' },
  { title: 'Vad lärde du dig?', type: 'long_text', label: 'Fritext' },
  { title: 'Hur kändes veckan?', type: 'rating', label: 'Betyg' },
]

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Ja/Nej-frågan för ett mål, med följdfrågan om Ja (samma mall som "Från målen"). */
function goalQuestions(goal: Goal, goals: Goal[]): Question[] {
  const template = goalTemplates(
    goal,
    goals.filter((g) => g.group === goal.group),
  )[0]
  return template.build(null)
}

/** Ungefär hur lång tid det tar för eleven, en halv minut per fråga. */
function minutes(questions: Question[]) {
  return Math.max(1, Math.round(questions.filter((q) => q.type !== 'statement').length / 2))
}

/**
 * Förslag på frågor från klassens mål (Texas skiss "Enklare frågor", steg 2, 2026-11-08). Varje
 * förslag är en Ja/Nej-fråga kopplad till ett mål, med en följdfråga om Ja. Grundfrågorna utan
 * mål finns sist. Läraren lägger till det som passar och ändrar texten efteråt.
 */
export function Suggestions({
  questions,
  goals,
  onAdd,
  onClose,
}: {
  questions: Question[]
  goals: Goal[]
  onAdd: (questions: Question[]) => void
  onClose: () => void
}) {
  const classGoals = goals.filter((g) => g.class_id)
  const unused = unusedGoals(questions, goals)
  const missingBasic = BASIC.filter((b) => !questions.some((q) => same(q.title, b.title)))
  const groups = goalGroups(classGoals).filter((g) => g.title)
  const count = questions.filter((q) => !q.show_if).length

  function addGoal(goal: Goal) {
    onAdd(goalQuestions(goal, goals))
  }
  function addAll() {
    onAdd(unused.flatMap((goal) => goalQuestions(goal, goals)))
  }
  function addBasic(basic: Basic) {
    onAdd([{ ...newQuestion(basic.type), title: basic.title } as Question])
  }

  return (
    <div className={styles.page}>
      <div className={styles.banner}>
        <span className={styles.bannerIcon}>
          <Sparkles aria-hidden="true" />
        </span>
        <span className={styles.bannerText}>
          <strong>Förslag på frågor från klassens mål</strong>
          <span>
            Varje fråga är redan kopplad till ett mål och har en följdfråga. Lägg till de som passar. Du kan ändra
            texten efteråt.
          </span>
        </span>
        {unused.length > 1 && (
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={addAll}>
            Lägg till alla {unused.length}
          </Button>
        )}
      </div>

      {classGoals.length === 0 && (
        <p className={styles.muted}>
          Klassen har inga mål från läroplanen än. Välj mål på fliken Läroplan, så kommer förslagen här.
        </p>
      )}

      {groups.map((group) => (
        <section key={group.title} className={styles.group} aria-label={group.title ?? undefined}>
          <div className={styles.groupHead}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <span className={styles.muted}>{group.goals.length} mål</span>
          </div>
          <ul className={styles.list}>
            {group.goals.map((goal) => {
              const [question, followUp] = goalQuestions(goal, goals)
              const added = !unused.includes(goal)
              return (
                <li key={goal.id} className={styles.row}>
                  <span className={styles.rowText}>
                    <span className={styles.title}>{question.title}</span>
                    <span className={styles.meta}>
                      <span className={styles.type}>Ja/Nej</span>
                      Ja visar
                      <span className={styles.goal}>
                        <Target aria-hidden="true" /> {goal.name}
                      </span>
                    </span>
                    {followUp && (
                      <span className={styles.followUp}>
                        <CornerDownRight aria-hidden="true" /> Om Ja: ”{followUp.title}”
                      </span>
                    )}
                  </span>
                  <AddButton added={added} onClick={() => addGoal(goal)} />
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <section className={styles.group} aria-label="Grundfrågor varje vecka">
        <div className={styles.groupHead}>
          <h3 className={styles.groupTitle}>Grundfrågor varje vecka</h3>
          <span className={styles.muted}>Utan mål</span>
        </div>
        <ul className={styles.list}>
          {BASIC.map((basic) => (
            <li key={basic.title} className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.titleRow}>
                  <span className={styles.title}>{basic.title}</span>
                  <span className={styles.type}>{basic.label}</span>
                </span>
              </span>
              <AddButton added={!missingBasic.includes(basic)} onClick={() => addBasic(basic)} />
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.footer}>
        <span className={styles.muted}>
          {count === 0
            ? 'Inga frågor valda än'
            : `${count} ${count === 1 ? 'fråga' : 'frågor'} · eleverna svarar på ungefär ${minutes(questions)} ${minutes(questions) === 1 ? 'minut' : 'minuter'}`}
        </span>
        <Button variant="primary" onClick={onClose}>
          {count === 0 ? 'Skapa egna frågor' : 'Fortsätt till frågorna'}
        </Button>
      </div>
    </div>
  )
}

function AddButton({ added, onClick }: { added: boolean; onClick: () => void }) {
  return added ? (
    <span className={styles.added}>
      <Check aria-hidden="true" /> Tillagd
    </span>
  ) : (
    <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={onClick}>
      Lägg till
    </Button>
  )
}
