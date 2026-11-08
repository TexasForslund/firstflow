import { Check } from 'lucide-react'
import { useState } from 'react'

import { useGoals } from '../../api/goals'
import {
  levelLabel,
  useLevelContent,
  useSaveLevelGoals,
  type ClassCurriculum,
  type LevelContent,
} from '../../api/syllabus'
import { Button, Card, HelpPopover } from '../../components'
import styles from './ClassGoals.module.css'

const MAX_NAME = 40

/**
 * Mål från läroplanen (idé 13, steg 2, Texas skiss 2026-11-08). Varje punkt i det centrala
 * innehållet för klassens ämnen är ett förslag. Läraren kryssar för punkter och ger målen korta
 * namn. Målen hör till klassen och används sedan i frågorna.
 */
export function ClassGoals({ classId, saved, canEdit }: { classId: string; saved: ClassCurriculum; canEdit: boolean }) {
  const [chosen, setChosen] = useState(saved.subjects[0]?.level_code)
  const levelCode = saved.subjects.some((s) => s.level_code === chosen) ? chosen : saved.subjects[0]?.level_code
  const goals = useGoals(canEdit, classId).data ?? []
  const content = useLevelContent(classId, levelCode)

  return (
    <section className={styles.section} aria-labelledby="class-goals-title">
      <div>
        <h2 id="class-goals-title" className={styles.title}>
          Mål från läroplanen <HelpPopover topic="curriculumGoals" />
        </h2>
        <p className={styles.muted}>
          Varje punkt är en del av det centrala innehållet. Kryssa för det eleverna gör på APL och ge målet ett kort
          namn. Målen används sedan i frågorna.
        </p>
      </div>
      <div className={styles.layout}>
        <nav className={styles.subjects} aria-label="Ämnen">
          {saved.subjects.map((s) => {
            const label = levelLabel(s)
            const count = goals.filter((g) => g.group === label).length
            const active = s.level_code === levelCode
            return (
              <button
                key={s.level_code}
                type="button"
                className={`${styles.subject} ${active ? styles.active : ''}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => setChosen(s.level_code)}
              >
                <span>{label}</span>
                {count > 0 && <span className={styles.count}>{count} mål</span>}
              </button>
            )
          })}
        </nav>
        <Card>
          <div className={styles.card}>
            {content.isPending && <p className={styles.muted}>Hämtar det centrala innehållet…</p>}
            {content.isError && <p className={styles.error}>{content.error.message}</p>}
            {content.data &&
              (canEdit ? (
                <PointsForm key={content.data.level_code} classId={classId} content={content.data} />
              ) : (
                <ChosenPoints content={content.data} />
              ))}
          </div>
        </Card>
      </div>
    </section>
  )
}

function Head({ content }: { content: LevelContent }) {
  return (
    <div className={styles.head}>
      <div>
        <h3 className={styles.cardTitle}>{content.title} · centralt innehåll</h3>
        <span className={styles.muted}>{content.points.length} punkter</span>
      </div>
      <span className={styles.muted}>Från Skolverket</span>
    </div>
  )
}

function PointsForm({ classId, content }: { classId: string; content: LevelContent }) {
  const save = useSaveLevelGoals(classId, content.level_code)
  const initial = () => new Map(content.points.flatMap((p) => (p.goal ? [[p.text, p.goal.name] as const] : [])))
  const [names, setNames] = useState<Map<string, string>>(initial)
  const [savedNow, setSavedNow] = useState(false)
  const missingName = [...names.values()].some((n) => !n.trim())

  function change(text: string, name: string | null) {
    const next = new Map(names)
    if (name === null) next.delete(text)
    else next.set(text, name)
    setNames(next)
    setSavedNow(false)
  }

  function submit() {
    const goals = [...names].map(([text, name]) => ({ content: text, name: name.trim() }))
    save.mutate(goals, { onSuccess: () => setSavedNow(true) })
  }

  return (
    <>
      <Head content={content} />
      <ul className={styles.points}>
        {content.points.map((point, i) => {
          const name = names.get(point.text)
          const id = `goal-${content.level_code}-${i}`
          return (
            <li key={point.text} className={styles.point}>
              <label className={styles.pointLabel}>
                <input
                  type="checkbox"
                  checked={name !== undefined}
                  onChange={(e) => change(point.text, e.target.checked ? (point.goal?.name ?? '') : null)}
                />
                <span className={name === undefined ? styles.muted : undefined}>{point.text}</span>
              </label>
              {name !== undefined && (
                <div className={styles.nameRow}>
                  <label className="sr-only" htmlFor={id}>
                    Målets namn
                  </label>
                  <input
                    id={id}
                    className={styles.name}
                    value={name}
                    maxLength={MAX_NAME}
                    placeholder="Kort namn, t.ex. Ritningsläsning"
                    onChange={(e) => change(point.text, e.target.value)}
                  />
                  <span className={styles.counter}>
                    {name.length}/{MAX_NAME}
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className={styles.footer}>
        {missingName && <span className={styles.muted}>Ge varje mål ett namn.</span>}
        {savedNow && (
          <span className={styles.saved}>
            <Check aria-hidden="true" /> Sparat
          </span>
        )}
        {save.isError && <span className={styles.error}>{save.error.message}</span>}
        <Button variant="primary" onClick={submit} disabled={save.isPending || missingName}>
          {save.isPending ? 'Sparar…' : 'Spara mål'}
        </Button>
      </div>
    </>
  )
}

/** Rektorn ser klassens mål men kan inte ändra. */
function ChosenPoints({ content }: { content: LevelContent }) {
  const chosen = content.points.filter((p) => p.goal)
  return (
    <>
      <Head content={content} />
      {chosen.length === 0 ? (
        <p className={styles.muted}>Klassens lärare har inte valt mål för ämnet än.</p>
      ) : (
        <ul className={styles.points}>
          {chosen.map((p) => (
            <li key={p.text} className={styles.point}>
              <span className={styles.goalName}>{p.goal?.name}</span>
              <span className={styles.muted}>{p.text}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
