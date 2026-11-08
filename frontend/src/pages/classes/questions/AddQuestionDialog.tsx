import { ArrowRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Question, QuestionType } from '../../../api/forms'
import { goalGroups, type Goal } from '../../../api/goals'
import { HelpPopover } from '../../../components'
import styles from './FormBuilder.module.css'
import { goalTemplates } from './goalTemplates'
import { QUESTION_TYPES, TYPE_GROUPS } from './questionTypes'
import { TypeBadge } from './TypeBadge'

/**
 * Menyn med frågetyper, grupperad och färgkodad som "Add form elements" i Typeform. Har klassen
 * mål från läroplanen finns fliken "Från målen" med färdiga frågor (idé 13, steg 5).
 */
export function AddQuestionDialog({
  goals = [],
  onPick,
  onAddMany,
  onClose,
}: {
  goals?: Goal[]
  onPick: (type: QuestionType) => void
  onAddMany: (build: (nextId: string | null) => Question[]) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    // Ingen close() vid avmontering: rutan försvinner med komponenten, och ett close-event
    // skulle annars stänga den direkt igen i React StrictMode.
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  const classGoals = goals.filter((g) => g.group)
  const [tab, setTab] = useState<'types' | 'goals'>('types')
  const [goalId, setGoalId] = useState(classGoals[0]?.id)

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${tab === 'goals' ? styles.dialogWide : ''}`}
      aria-labelledby="add-question-title"
      onClose={onClose}
      onClick={(e) => {
        // Klick utanför rutan stänger menyn.
        if (e.target === ref.current) onClose()
      }}
    >
      <div className={styles.dialogInner}>
        <div className={styles.dialogHeader}>
          <h2 id="add-question-title" className={styles.dialogTitle}>
            Lägg till fråga
          </h2>
          <button type="button" className={styles.iconButton} aria-label="Stäng" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        {classGoals.length > 0 && (
          <div className={styles.addTabs} role="group" aria-label="Visa">
            {(
              [
                ['types', 'Frågetyp'],
                ['goals', 'Från målen'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={styles.addTab}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {tab === 'types' ? (
          <div className={styles.typeGroups}>
            {TYPE_GROUPS.map((group) => (
              <section key={group.id} className={styles.typeGroup} aria-labelledby={`group-${group.id}`}>
                <h3 id={`group-${group.id}`} className={styles.typeGroupTitle}>
                  {group.label}
                </h3>
                <ul className={styles.typeList}>
                  {group.types.map((type) => (
                    <li key={type}>
                      <button type="button" className={styles.typeButton} onClick={() => onPick(type)}>
                        <TypeBadge type={type} />
                        <span className={styles.typeText}>
                          <span className={styles.typeLabel}>{QUESTION_TYPES[type].label}</span>
                          <span className={styles.typeDescription}>{QUESTION_TYPES[type].description}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <FromGoals goals={classGoals} goalId={goalId} onGoal={setGoalId} onAddMany={onAddMany} />
        )}
      </div>
    </dialog>
  )
}

function FromGoals({
  goals,
  goalId,
  onGoal,
  onAddMany,
}: {
  goals: Goal[]
  goalId: string | undefined
  onGoal: (id: string) => void
  onAddMany: (build: (nextId: string | null) => Question[]) => void
}) {
  const goal = goals.find((g) => g.id === goalId) ?? goals[0]
  const templates = goalTemplates(
    goal,
    goals.filter((g) => g.group === goal.group),
  )
  return (
    <div className={styles.fromGoals}>
      <p className={styles.settingsHint}>
        Färdiga frågor där svaret redan är kopplat till målet. Ändra texten som du vill efteråt.{' '}
        <HelpPopover topic="goalQuestions" />
      </p>
      <div className={styles.fromGoalsLayout}>
        <nav className={styles.goalNav} aria-label="Klassens mål">
          {goalGroups(goals).map((group) => (
            <div key={group.title} className={styles.goalNavGroup}>
              <span className={styles.typeGroupTitle}>{group.title}</span>
              {group.goals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={styles.goalNavItem}
                  aria-current={g.id === goal.id ? 'true' : undefined}
                  onClick={() => onGoal(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className={styles.templates}>
          <div className={styles.goalSourceBox}>
            <span className={styles.goalSourceTitle}>
              {goal.name} · {goal.group}
            </span>
            <span>”{goal.curriculum}”</span>
          </div>
          {templates.map((t) => (
            <section key={t.id} className={styles.template} aria-label={t.title}>
              <div className={styles.templateHead}>
                <TypeBadge type={t.type} />
                <span className={styles.templateKind}>{t.kind}</span>
                <span className={styles.templateTitle}>{t.title}</span>
                <button type="button" className={styles.actionButton} onClick={() => onAddMany(t.build)}>
                  Lägg till
                </button>
              </div>
              <ul className={styles.templateAnswers}>
                {t.answers.map((a) => (
                  <li key={a.label} className={styles.templateAnswer}>
                    {a.label}
                    {a.goal && (
                      <span className={styles.templateGoal}>
                        <ArrowRight aria-hidden="true" /> {a.goal}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {t.note && <p className={styles.settingsHint}>{t.note}</p>}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
