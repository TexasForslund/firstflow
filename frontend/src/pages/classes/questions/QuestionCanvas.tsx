import { Check, Star, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import type { ChoiceQuestion, Question } from '../../../api/forms'
import styles from './FormBuilder.module.css'
import { LETTERS, newId, QUESTION_TYPES, questionProblems, RATING_MAX } from './questionTypes'
import { TypeBadge } from './TypeBadge'

interface Props {
  question: Question
  number: number
  total: number
  focusTitle: boolean
  onChange: (question: Question) => void
}

/**
 * Frågan som eleven kommer att se den, där läraren skriver direkt i texten (som i Typeform).
 * Elevens egen vy, med en fråga i taget i mobilen, byggs i nästa steg.
 */
export function QuestionCanvas({ question, number, total, focusTitle, onChange }: Props) {
  const titleRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus()
  }, [focusTitle, question.id])

  const problems = questionProblems(question)
  const typeLabel = QUESTION_TYPES[question.type].label
  const optional = question.type !== 'statement' && !question.required

  return (
    <section className={styles.canvas} aria-label={`Fråga ${number}`}>
      <p className={styles.canvasMeta}>
        Fråga {number} av {total} · {typeLabel}
        {optional && ' · Valfri'}
      </p>
      <div className={styles.questionHead}>
        <TypeBadge type={question.type} number={number} />
        <div className={styles.questionTexts}>
          <textarea
            ref={titleRef}
            className={styles.titleInput}
            value={question.title}
            placeholder={question.type === 'statement' ? 'Skriv meddelandet här…' : 'Skriv frågan här…'}
            aria-label="Frågans rubrik"
            maxLength={500}
            rows={1}
            onChange={(e) => onChange({ ...question, title: e.target.value })}
          />
          <textarea
            className={styles.descriptionInput}
            value={question.description}
            placeholder="Beskrivning (valfri)"
            aria-label="Beskrivning"
            maxLength={2000}
            rows={1}
            onChange={(e) => onChange({ ...question, description: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.answerArea}>
        <AnswerPreview question={question} onChange={onChange} />
      </div>

      {problems.length > 0 && (
        <ul className={styles.problems} aria-label="Att fylla i">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AnswerPreview({ question, onChange }: { question: Question; onChange: (q: Question) => void }) {
  switch (question.type) {
    case 'short_text':
      return <p className={styles.fakeInput}>Eleven skriver sitt svar här</p>
    case 'long_text':
      return (
        <>
          <p className={styles.fakeInput}>Eleven skriver sitt svar här</p>
          <p className={styles.hintText}>Shift + Enter ger ny rad</p>
        </>
      )
    case 'choice':
      return <ChoiceEditor question={question} onChange={onChange} />
    case 'yes_no':
      return (
        <ul className={styles.choices}>
          {[
            ['J', 'Ja'],
            ['N', 'Nej'],
          ].map(([key, label]) => (
            <li key={key} className={styles.choice}>
              <span className={styles.key}>{key}</span>
              <span className={styles.choiceStatic}>{label}</span>
            </li>
          ))}
        </ul>
      )
    case 'rating':
      return (
        <div className={styles.stars} aria-label="Betyg från 1 till 5">
          {Array.from({ length: RATING_MAX }, (_, i) => (
            <span key={i} className={styles.star}>
              <Star aria-hidden="true" />
              <span>{i + 1}</span>
            </span>
          ))}
        </div>
      )
    case 'statement':
      return (
        <span className={styles.fakeButton}>
          Fortsätt <Check aria-hidden="true" />
        </span>
      )
  }
}

function ChoiceEditor({ question, onChange }: { question: ChoiceQuestion; onChange: (q: Question) => void }) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const inputs = useRef(new Map<string, HTMLInputElement>())
  useEffect(() => {
    if (focusId) inputs.current.get(focusId)?.focus()
  }, [focusId])

  const max = 20
  function setLabel(id: string, label: string) {
    onChange({ ...question, choices: question.choices.map((c) => (c.id === id ? { ...c, label } : c)) })
  }
  function add(after?: number) {
    if (question.choices.length >= max) return
    const choice = { id: newId(), label: '' }
    const choices = [...question.choices]
    choices.splice(after === undefined ? choices.length : after + 1, 0, choice)
    onChange({ ...question, choices })
    setFocusId(choice.id)
  }
  function remove(id: string) {
    onChange({ ...question, choices: question.choices.filter((c) => c.id !== id) })
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault()
      add(index)
    }
  }

  return (
    <>
      <ul className={styles.choices}>
        {question.choices.map((choice, i) => (
          <li key={choice.id} className={styles.choice}>
            <span className={styles.key}>{LETTERS[i]}</span>
            <input
              ref={(el) => {
                if (el) inputs.current.set(choice.id, el)
                else inputs.current.delete(choice.id)
              }}
              className={styles.choiceInput}
              value={choice.label}
              placeholder={`Alternativ ${LETTERS[i]}`}
              aria-label={`Alternativ ${LETTERS[i]}`}
              maxLength={200}
              onChange={(e) => setLabel(choice.id, e.target.value)}
              onKeyDown={(e) => keyDown(e, i)}
            />
            {question.choices.length > 2 && (
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Ta bort alternativ ${LETTERS[i]}`}
                onClick={() => remove(choice.id)}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
        {question.allow_other && (
          <li className={`${styles.choice} ${styles.choiceOther}`}>
            <span className={styles.key}>{LETTERS[question.choices.length]}</span>
            <span className={styles.choiceStatic}>Annat (eleven skriver själv)</span>
          </li>
        )}
      </ul>
      {question.choices.length < max && (
        <button type="button" className={styles.linkButton} onClick={() => add()}>
          Lägg till alternativ
        </button>
      )}
      {question.multiple && <p className={styles.hintText}>Eleven kan välja flera alternativ</p>}
    </>
  )
}
