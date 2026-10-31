import { Eye, Lock, Send, Star } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { Question } from '../../api/forms'
import { useAddComment, type AnswerRead, type CommentVisibility, type ReportDetail } from '../../api/reports'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, HelpPopover } from '../../components'
import { answerText } from './answers'
import styles from './AnswerView.module.css'

/** Svaren i en inskickad redovisning, fråga för fråga. Används av eleven och läraren. */
export function AnswerView({ report }: { report: ReportDetail }) {
  const answers = new Map(report.answers.map((a) => [a.question_id, a]))
  const shown = report.path
    .map((id) => report.questions.find((q) => q.id === id))
    .filter((q): q is Question => !!q && q.type !== 'statement')

  return (
    <dl className={styles.answers}>
      {shown.map((question) => {
        const answer = answers.get(question.id)
        return (
          <div key={question.id} className={styles.item}>
            <dt className={styles.question}>{question.title}</dt>
            <dd className={styles.answer}>
              <AnswerContent question={question} answer={answer} />
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Ett svar: text, alternativ som etiketter eller betyg som stjärnor. */
export function AnswerContent({ question, answer }: { question: Question; answer: AnswerRead | undefined }) {
  return (
    <>
      {!answer ? (
        <span className={styles.none}>Inget svar</span>
      ) : question.type === 'rating' ? (
        <span className={styles.stars} aria-label={`${answer.rating} av 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} aria-hidden="true" className={n <= (answer.rating ?? 0) ? styles.starOn : styles.starOff} />
          ))}
        </span>
      ) : question.type === 'choice' || question.type === 'yes_no' ? (
        <span className={styles.chips}>
          {answerText(question, answer)
            .split(', ')
            .map((label) => (
              <span key={label} className={styles.chip}>
                {label}
              </span>
            ))}
        </span>
      ) : (
        <p className={styles.text}>{answer.text}</p>
      )}
    </>
  )
}

const ROLE = { teacher: 'Lärare', student: 'Elev', supervisor: 'Handledare' } as Record<string, string>

function timeAgo(iso: string) {
  return new Date(iso).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * Kommentarstråden under ett inlägg, som i sociala medier. Lärare och handledare kan skriva
 * privat, så att bara lärare och handledare ser kommentaren (Texas, 2026-10-30). "Alla ser" är
 * förvalt varje gång, så att ingen skriver privat av misstag. Eleven får aldrig privata kommentarer.
 */
export function Comments({ report }: { report: ReportDetail }) {
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<CommentVisibility>('all')
  const add = useAddComment(report.id)
  const { data: me } = useCurrentUser()
  const isStaff = me?.role === 'teacher' || me?.role === 'supervisor'
  const isPrivate = isStaff && visibility === 'staff'
  // Vem som ser en kommentar för alla, sett från den som skriver.
  const audience =
    me?.role === 'teacher' ? 'Eleven och handledaren' : me?.role === 'supervisor' ? 'Eleven och läraren' : ''

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim()) return
    add.mutate(
      { body, visibility: isPrivate ? 'staff' : 'all' },
      {
        onSuccess: () => {
          setBody('')
          setVisibility('all')
        },
      },
    )
  }

  return (
    <section className={styles.comments} aria-labelledby={`comments-${report.id}`}>
      <h2 id={`comments-${report.id}`} className={styles.commentsTitle}>
        Kommentarer {report.comments.length > 0 && <span className={styles.count}>{report.comments.length}</span>}
      </h2>
      {report.comments.length === 0 ? (
        <p className={styles.none}>Inga kommentarer än.</p>
      ) : (
        <ul className={styles.commentList}>
          {report.comments.map((comment) => (
            <li key={comment.id} className={styles.comment}>
              <Avatar name={comment.author.name} size="sm" />
              <div className={styles.bubble} data-private={comment.visibility === 'staff' ? '' : undefined}>
                <p className={styles.commentMeta}>
                  <strong>{comment.author.name}</strong>
                  {comment.author_role !== 'student' && (
                    <span className={styles.role}>{ROLE[comment.author_role]}</span>
                  )}
                  <span className={styles.time}>{timeAgo(comment.created_at)}</span>
                  {comment.visibility === 'staff' && (
                    <span className={styles.privateBadge}>
                      <Lock aria-hidden="true" /> Bara lärare och handledare
                    </span>
                  )}
                </p>
                <p className={styles.commentBody}>{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {isStaff && (
        <div className={styles.visibility} role="group" aria-label="Vem ser kommentaren">
          <button
            type="button"
            className={styles.visibilityOption}
            aria-pressed={!isPrivate}
            onClick={() => setVisibility('all')}
          >
            <Eye aria-hidden="true" /> Alla ser
          </button>
          <button
            type="button"
            className={styles.visibilityOption}
            data-private=""
            aria-pressed={isPrivate}
            onClick={() => setVisibility('staff')}
          >
            <Lock aria-hidden="true" /> Bara lärare och handledare
          </button>
          <HelpPopover topic="privateComment" />
        </div>
      )}
      <form className={styles.commentForm} data-private={isPrivate ? '' : undefined} onSubmit={submit}>
        <label htmlFor={`comment-${report.id}`} className="sr-only">
          Skriv en kommentar
        </label>
        <input
          id={`comment-${report.id}`}
          className={styles.commentInput}
          value={body}
          placeholder={isPrivate ? 'Skriv en privat kommentar…' : 'Skriv en kommentar…'}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="submit"
          className={styles.send}
          aria-label="Skicka kommentar"
          disabled={!body.trim() || add.isPending}
        >
          <Send aria-hidden="true" />
        </button>
      </form>
      {isStaff && (
        <p className={styles.visibilityHint} data-private={isPrivate ? '' : undefined}>
          {isPrivate ? (
            <>
              <Lock aria-hidden="true" /> Bara lärare och handledare ser kommentaren. Eleven ser den inte och får ingen
              notis.
            </>
          ) : (
            <>
              <Eye aria-hidden="true" /> {audience} ser kommentaren.
            </>
          )}
        </p>
      )}
      {add.isError && (
        <p className={styles.error} role="alert">
          {add.error.message}
        </p>
      )}
    </section>
  )
}
