import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from 'lucide-react'
import { useId } from 'react'

import type { LogicRule, Question } from '../../../api/forms'
import { Switch } from '../../../components'
import styles from './FormBuilder.module.css'
import { answerOptions, hasLogic, QUESTION_TYPES, questionTitle } from './questionTypes'
import { TypeBadge } from './TypeBadge'

interface Props {
  question: Question
  questions: Question[]
  index: number
  onChange: (question: Question) => void
  onMove: (direction: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}

export function QuestionSettings({ question, questions, index, onChange, onMove, onDuplicate, onDelete }: Props) {
  const info = QUESTION_TYPES[question.type]
  return (
    <aside className={styles.settings} aria-label="Inställningar för frågan">
      <section className={styles.settingsSection}>
        <h2 className={styles.settingsTitle}>Frågetyp</h2>
        <p className={styles.typeRow}>
          <TypeBadge type={question.type} />
          {info.label}
        </p>
        <p className={styles.settingsHint}>{info.description}</p>
      </section>

      {question.type !== 'statement' && (
        <section className={styles.settingsSection}>
          <h2 className={styles.settingsTitle}>Svar</h2>
          <Switch
            label="Obligatorisk"
            checked={question.required}
            onChange={(required) => onChange({ ...question, required })}
          />
          {question.type === 'choice' && (
            <>
              <Switch
                label="Flera val"
                checked={question.multiple}
                onChange={(multiple) => onChange({ ...question, multiple })}
              />
              <Switch
                label="Alternativet Annat"
                checked={question.allow_other}
                onChange={(allow_other) => onChange({ ...question, allow_other })}
              />
            </>
          )}
        </section>
      )}

      {hasLogic(question) && (
        <LogicEditor
          question={question}
          later={questions.slice(index + 1).map((q, i) => ({ id: q.id, label: `${index + i + 2}. ${questionTitle(q)}` }))}
          onChange={(logic) => onChange({ ...question, logic })}
        />
      )}

      <section className={styles.settingsSection}>
        <h2 className={styles.settingsTitle}>Frågan</h2>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUp aria-hidden="true" /> Flytta upp
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => onMove(1)}
            disabled={index === questions.length - 1}
          >
            <ArrowDown aria-hidden="true" /> Flytta ned
          </button>
          <button type="button" className={styles.actionButton} onClick={onDuplicate}>
            <Copy aria-hidden="true" /> Kopiera
          </button>
          <button type="button" className={styles.actionButton} onClick={onDelete}>
            <Trash2 aria-hidden="true" /> Ta bort
          </button>
        </div>
      </section>
    </aside>
  )
}

const END = '__end__'

function LogicEditor({
  question,
  later,
  onChange,
}: {
  question: Question & { logic: LogicRule[] }
  later: { id: string; label: string }[]
  onChange: (logic: LogicRule[]) => void
}) {
  const options = answerOptions(question)
  const baseId = useId()

  function update(i: number, rule: LogicRule) {
    onChange(question.logic.map((r, j) => (j === i ? rule : r)))
  }
  function add() {
    const used = new Set(question.logic.map((r) => r.when))
    const when = options.find((o) => !used.has(o.value))?.value ?? options[0].value
    onChange([...question.logic, { when, goto: later[1]?.id ?? null }])
  }

  return (
    <section className={styles.settingsSection}>
      <h2 className={styles.settingsTitle}>Logik</h2>
      {question.logic.length === 0 ? (
        <p className={styles.settingsHint}>Alla elever får nästa fråga. Lägg till en regel för att hoppa över frågor.</p>
      ) : (
        <ol className={styles.rules}>
          {question.logic.map((rule, i) => (
            <li key={i} className={styles.rule}>
              <div className={styles.ruleHeader}>
                <span className={styles.ruleLabel}>Regel {i + 1}</span>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Ta bort regel ${i + 1}`}
                  onClick={() => onChange(question.logic.filter((_, j) => j !== i))}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <label className={styles.ruleField} htmlFor={`${baseId}-when-${i}`}>
                Om svaret är
              </label>
              <select
                id={`${baseId}-when-${i}`}
                className={styles.select}
                value={rule.when}
                onChange={(e) => update(i, { ...rule, when: e.target.value })}
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <label className={styles.ruleField} htmlFor={`${baseId}-goto-${i}`}>
                gå till
              </label>
              <select
                id={`${baseId}-goto-${i}`}
                className={styles.select}
                value={rule.goto ?? END}
                onChange={(e) => update(i, { ...rule, goto: e.target.value === END ? null : e.target.value })}
              >
                {later.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
                <option value={END}>Slutet (skicka in)</option>
              </select>
            </li>
          ))}
        </ol>
      )}
      {question.logic.length > 0 && (
        <p className={styles.settingsHint}>
          Annars går eleven till nästa fråga.
          {question.type === 'choice' && question.multiple && ' Väljer eleven flera alternativ gäller den första regeln som stämmer.'}
        </p>
      )}
      {question.logic.length < 20 && (
        <button type="button" className={styles.actionButton} onClick={add}>
          <Plus aria-hidden="true" /> Lägg till regel
        </button>
      )}
    </section>
  )
}
