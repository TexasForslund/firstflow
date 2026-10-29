import { Check, ChevronLeft, CornerDownLeft, Star, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'

import type { Question } from '../../api/forms'
import type { AnswerValue } from '../../api/reports'
import { LETTERS } from '../classes/questions/questionTypes'
import { isAnswered, isRequired, visiblePath, type Answers } from './answers'
import styles from './ReportStepper.module.css'

/** Hur länge ett val syns innan nästa fråga kommer (pulsen är 250 ms). */
const AUTO_ADVANCE_MS = 400

interface Props {
  title: string
  subtitle?: string
  questions: Question[]
  initialAnswers?: Answers
  /** Sparar svaret när eleven går vidare. Utelämnas vid förhandsgranskning. */
  onSave?: (questionId: string, value: AnswerValue) => Promise<void>
  onSubmit: () => Promise<void>
  onClose: () => void
  done: { title: string; body: string; actions: ReactNode }
  /** Visas överst, t.ex. "Förhandsgranskning". */
  badge?: string
  /** Visas på sista steget ovanför Skicka in, t.ex. valet av projekt. */
  beforeSubmit?: ReactNode
}

/**
 * Redovisningen som en story: en fråga i taget i helskärm, med förlopp i segment överst.
 * Föregående, Nästa och till sist Skicka in. Enter, bokstäver, J/N och siffror fungerar
 * på dator, svep åt vänster eller höger i mobilen. Se docs/design/fragor-typeform.md.
 */
export function ReportStepper({
  title,
  subtitle,
  questions,
  initialAnswers = {},
  onSave,
  onSubmit,
  onClose,
  done,
  badge,
  beforeSubmit,
}: Props) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers)
  const answersRef = useRef(answers)
  const path = visiblePath(questions, answers)
  // Fortsätt där eleven slutade: första obesvarade frågan, eller sista steget om allt är besvarat.
  const [pos, setPos] = useState(() => {
    const start = visiblePath(questions, initialAnswers)
    if (Object.keys(initialAnswers).length === 0) return 0
    const first = start.findIndex((id) => {
      const q = questions.find((x) => x.id === id)!
      return q.type !== 'statement' && !isAnswered(q, initialAnswers[id])
    })
    return first === -1 ? start.length - 1 : first
  })
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const advanceTimer = useRef<number | undefined>(undefined)

  const index = Math.min(pos, path.length - 1)
  const question = questions.find((q) => q.id === path[index])
  const isLast = index === path.length - 1

  const stepRef = useRef<HTMLElement>(null)
  // Fokus till svarsfältet om frågan har ett, annars till rubriken så att skärmläsaren läser frågan.
  useEffect(() => {
    const field = stepRef.current?.querySelector<HTMLElement>('input, textarea')
    ;(field ?? headingRef.current)?.focus()
  }, [index, finished])

  useEffect(() => () => window.clearTimeout(advanceTimer.current), [])

  const setAnswer = useCallback((questionId: string, value: AnswerValue) => {
    const next = { ...answersRef.current, [questionId]: value }
    answersRef.current = next
    setAnswers(next)
    setError(null)
  }, [])

  const goNext = useCallback(async () => {
    if (!question || busy) return
    window.clearTimeout(advanceTimer.current)
    const current = answersRef.current
    const answer = current[question.id]
    if (isRequired(question) && !isAnswered(question, answer)) {
      setError(question.type === 'choice' ? 'Välj ett alternativ för att gå vidare' : 'Svara på frågan för att gå vidare')
      return
    }
    setBusy(true)
    try {
      if (question.type !== 'statement' && onSave) await onSave(question.id, answer ?? {})
      const nextPath = visiblePath(questions, current)
      if (nextPath.indexOf(question.id) >= nextPath.length - 1) {
        await onSubmit()
        setFinished(true)
      } else {
        setDirection('forward')
        setPos(nextPath.indexOf(question.id) + 1)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Det gick inte att spara. Kontrollera anslutningen och försök igen.')
    } finally {
      setBusy(false)
    }
  }, [question, busy, onSave, onSubmit, questions])

  const goBack = useCallback(() => {
    window.clearTimeout(advanceTimer.current)
    if (index === 0) return
    setError(null)
    setDirection('back')
    setPos(index - 1)
  }, [index])

  /** Enkelval, ja/nej och betyg går vidare av sig självt efter en kort bekräftelse. */
  const chooseAndAdvance = useCallback(
    (questionId: string, value: AnswerValue) => {
      setAnswer(questionId, value)
      window.clearTimeout(advanceTimer.current)
      advanceTimer.current = window.setTimeout(() => void goNext(), AUTO_ADVANCE_MS)
    },
    [setAnswer, goNext],
  )

  // Tangentbordet på dator.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (finished || !question) return
      if (event.key === 'Escape') return onClose()
      const target = event.target as HTMLElement
      const typing = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT'
      if (event.key === 'Enter' && !event.shiftKey) {
        if (target.tagName === 'BUTTON') return // knappen själv hanterar Enter
        event.preventDefault()
        void goNext()
        return
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toUpperCase()
      const current = answersRef.current[question.id]
      if (question.type === 'choice') {
        const i = LETTERS.indexOf(key)
        if (i >= 0 && i < question.choices.length) {
          const id = question.choices[i].id
          if (question.multiple) {
            const ids = current?.choice_ids ?? []
            setAnswer(question.id, {
              ...current,
              choice_ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
            })
          } else chooseAndAdvance(question.id, { choice_ids: [id] })
        }
      } else if (question.type === 'yes_no' && (key === 'J' || key === 'Y' || key === 'N')) {
        chooseAndAdvance(question.id, { boolean: key !== 'N' })
      } else if (question.type === 'rating' && /^[1-5]$/.test(event.key)) {
        chooseAndAdvance(question.id, { rating: Number(event.key) })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finished, question, goNext, onClose, setAnswer, chooseAndAdvance])

  // Svep i mobilen: vänster = nästa, höger = föregående. Inte när eleven skriver.
  const touch = useRef<{ x: number; y: number } | null>(null)
  function onTouchStart(event: TouchEvent) {
    const target = event.target as HTMLElement
    touch.current = target.closest('input, textarea') ? null : { x: event.touches[0].clientX, y: event.touches[0].clientY }
  }
  function onTouchEnd(event: TouchEvent) {
    if (!touch.current) return
    const dx = event.changedTouches[0].clientX - touch.current.x
    const dy = event.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) < 60 || Math.abs(dy) > 50) return
    if (dx < 0) void goNext()
    else goBack()
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <header className={styles.top}>
        <div className={styles.segments} aria-hidden="true">
          {path.map((id, i) => (
            <span key={id} className={styles.segment}>
              <span className={styles.segmentFill} style={{ transform: `scaleX(${finished || i <= index ? 1 : 0})` }} />
            </span>
          ))}
        </div>
        <div className={styles.topRow}>
          <div className={styles.topText}>
            <p className={styles.topTitle}>
              {title}
              {badge && <span className={styles.badge}>{badge}</span>}
            </p>
            {subtitle && <p className={styles.topSubtitle}>{subtitle}</p>}
          </div>
          <button type="button" className={styles.close} aria-label="Stäng" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
      </header>

      {finished ? (
        <section className={`${styles.step} ${styles.doneStep}`}>
          <svg className={styles.doneCheck} viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="24" />
            <path d="M15 27l7 7 15-16" />
          </svg>
          <h2 ref={headingRef} tabIndex={-1} className={styles.question}>
            {done.title}
          </h2>
          <p className={styles.description}>{done.body}</p>
          <div className={styles.doneActions}>{done.actions}</div>
        </section>
      ) : question ? (
        <>
          <section
            key={question.id}
            ref={stepRef}
            className={`${styles.step} ${direction === 'forward' ? styles.fromBelow : styles.fromAbove}`}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <p className={styles.counter} aria-live="polite">
              {index + 1} av {path.length}
              {question.type !== 'statement' && !question.required && ' · Valfri'}
            </p>
            <h2 ref={headingRef} tabIndex={-1} className={styles.question}>
              {question.title}
            </h2>
            {question.description && <p className={styles.description}>{question.description}</p>}
            <div className={styles.answer}>
              <AnswerInput
                question={question}
                answer={answers[question.id]}
                onChange={(value) => setAnswer(question.id, value)}
                onChoose={(value) => chooseAndAdvance(question.id, value)}
              />
            </div>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {isLast && beforeSubmit}
          </section>

          <footer className={styles.bottom}>
            <button
              type="button"
              className={styles.back}
              onClick={goBack}
              disabled={index === 0 || busy}
              aria-label="Föregående fråga"
            >
              <ChevronLeft aria-hidden="true" />
              <span>Föregående</span>
            </button>
            <button type="button" className={styles.next} onClick={() => void goNext()} disabled={busy}>
              {busy ? 'Sparar…' : isLast ? 'Skicka in' : question.type === 'statement' ? 'Fortsätt' : 'Nästa'}
              {!busy && !isLast && <Check aria-hidden="true" />}
            </button>
            <span className={styles.enterHint} aria-hidden="true">
              eller tryck <strong>Enter</strong> <CornerDownLeft />
            </span>
          </footer>
        </>
      ) : null}
    </div>
  )
}

function AnswerInput({
  question,
  answer,
  onChange,
  onChoose,
}: {
  question: Question
  answer: AnswerValue | undefined
  onChange: (value: AnswerValue) => void
  onChoose: (value: AnswerValue) => void
}) {
  switch (question.type) {
    case 'short_text':
      return (
        <input
          className={styles.textInput}
          value={answer?.text ?? ''}
          placeholder="Skriv ditt svar här…"
          aria-label={question.title}
          maxLength={500}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      )
    case 'long_text':
      return (
        <>
          <textarea
            className={`${styles.textInput} ${styles.textArea}`}
            value={answer?.text ?? ''}
            placeholder="Skriv ditt svar här…"
            aria-label={question.title}
            maxLength={5000}
            rows={2}
              onChange={(e) => onChange({ text: e.target.value })}
          />
          <p className={styles.hint}>Shift + Enter ger ny rad</p>
        </>
      )
    case 'choice':
      return <ChoiceInput question={question} answer={answer} onChange={onChange} onChoose={onChoose} />
    case 'yes_no':
      return (
        <div className={styles.options} role="group" aria-label={question.title}>
          {(
            [
              ['J', 'Ja', true],
              ['N', 'Nej', false],
            ] as const
          ).map(([key, label, value]) => (
            <OptionButton
              key={key}
              letter={key}
              label={label}
              selected={answer?.boolean === value}
              onClick={() => onChoose({ boolean: value })}
            />
          ))}
        </div>
      )
    case 'rating':
      return (
        <div className={styles.stars} role="group" aria-label={question.title}>
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = (answer?.rating ?? 0) >= n
            return (
              <button
                key={n}
                type="button"
                className={`${styles.star} ${filled ? styles.starFilled : ''} ${answer?.rating === n ? styles.starPicked : ''}`}
                aria-label={`${n} av 5`}
                aria-pressed={answer?.rating === n}
                onClick={() => onChoose({ rating: n })}
              >
                <Star aria-hidden="true" />
                <span>{n}</span>
              </button>
            )
          })}
        </div>
      )
    case 'statement':
      return null
  }
}

function ChoiceInput({
  question,
  answer,
  onChange,
  onChoose,
}: {
  question: Extract<Question, { type: 'choice' }>
  answer: AnswerValue | undefined
  onChange: (value: AnswerValue) => void
  onChoose: (value: AnswerValue) => void
}) {
  const selected = answer?.choice_ids ?? []
  const [otherOpen, setOtherOpen] = useState(!!answer?.other_text)
  const otherRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (otherOpen) otherRef.current?.focus()
  }, [otherOpen])

  function toggle(id: string) {
    if (question.multiple) {
      onChange({ ...answer, choice_ids: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] })
    } else {
      setOtherOpen(false)
      onChoose({ choice_ids: [id] })
    }
  }
  function toggleOther() {
    if (otherOpen) {
      setOtherOpen(false)
      onChange({ ...answer, other_text: null })
    } else {
      setOtherOpen(true)
      // Enkelval: Annat ersätter det valda alternativet.
      onChange(question.multiple ? { ...answer } : { other_text: answer?.other_text ?? '' })
    }
  }

  return (
    <>
      {question.multiple && <p className={styles.hint}>Välj ett eller flera</p>}
      <div className={styles.options} role="group" aria-label={question.title}>
        {question.choices.map((choice, i) => (
          <OptionButton
            key={choice.id}
            letter={LETTERS[i]}
            label={choice.label}
            selected={selected.includes(choice.id)}
            onClick={() => toggle(choice.id)}
          />
        ))}
        {question.allow_other && (
          <OptionButton
            letter={LETTERS[question.choices.length]}
            label="Annat"
            selected={otherOpen}
            onClick={toggleOther}
          />
        )}
      </div>
      {otherOpen && (
        <input
          ref={otherRef}
          className={styles.textInput}
          value={answer?.other_text ?? ''}
          placeholder="Skriv vad…"
          aria-label="Annat, skriv vad"
          maxLength={500}
          onChange={(e) =>
            onChange(question.multiple ? { ...answer, other_text: e.target.value } : { other_text: e.target.value })
          }
        />
      )}
    </>
  )
}

function OptionButton({
  letter,
  label,
  selected,
  onClick,
}: {
  letter: string
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className={styles.letter}>{letter}</span>
      <span className={styles.optionLabel}>{label}</span>
      {selected && <Check className={styles.optionCheck} aria-hidden="true" />}
    </button>
  )
}
