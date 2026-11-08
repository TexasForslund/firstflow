import { Camera, Star } from 'lucide-react'

import type { Question } from '../../../api/forms'
import styles from './QuestionCards.module.css'
import { answerOptions, LETTERS, questionTitle } from './questionTypes'

/**
 * Så ser eleven den valda frågan (Texas skiss "Enklare frågor", 2026-11-08). Har ett svar
 * följdfrågor visas svaret som valt och följdfrågorna under, som i elevens vy.
 */
export function PhonePreview({
  question,
  followUps,
  number,
  total,
}: {
  question: Question
  followUps: Question[]
  number: number
  total: number
}) {
  const shownWhen = followUps[0]?.show_if?.when ?? null
  const shown = followUps.filter((f) => f.show_if?.when === shownWhen)
  return (
    <aside className={styles.preview} aria-label="Så ser eleven frågan">
      <span className={styles.previewLabel}>Så ser eleven frågan</span>
      <div className={styles.phone}>
        <div className={styles.segments} aria-hidden="true">
          {Array.from({ length: Math.min(total, 12) }, (_, i) => (
            <span key={i} data-done={i < number ? '' : undefined} />
          ))}
        </div>
        <span className={styles.phoneCounter}>
          Fråga {number} av {total}
        </span>
        <span className={styles.phoneTitle}>{questionTitle(question)}</span>
        {question.description && <span className={styles.phoneDescription}>{question.description}</span>}
        <PreviewAnswer question={question} selected={shownWhen} />
        {shown.map((f) => (
          <div key={f.id} className={styles.phoneFollowUp}>
            <span className={styles.phoneFollowUpTitle}>{questionTitle(f)}</span>
            <PreviewAnswer question={f} selected={null} />
          </div>
        ))}
      </div>
    </aside>
  )
}

function PreviewAnswer({ question, selected }: { question: Question; selected: string | null }) {
  switch (question.type) {
    case 'short_text':
    case 'long_text':
      return <span className={question.type === 'long_text' ? styles.phoneArea : styles.phoneInput} />
    case 'yes_no':
    case 'choice': {
      const options = answerOptions(question)
      return (
        <span className={styles.phoneOptions}>
          {options.map((o, i) => (
            <span key={o.value} className={styles.phoneOption} data-selected={o.value === selected ? '' : undefined}>
              <span className={styles.phoneLetter}>{question.type === 'yes_no' ? (i ? 'N' : 'J') : LETTERS[i]}</span>
              {o.label}
            </span>
          ))}
          {question.type === 'choice' && question.allow_other && (
            <span className={styles.phoneOption}>
              <span className={styles.phoneLetter}>{LETTERS[options.length]}</span>
              Annat
            </span>
          )}
        </span>
      )
    }
    case 'rating':
      return (
        <span className={styles.phoneStars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} aria-hidden="true" />
          ))}
        </span>
      )
    case 'images':
      return (
        <span className={styles.phoneOption}>
          <Camera aria-hidden="true" /> Ta foto eller välj bilder
        </span>
      )
    case 'statement':
      return null
  }
}
