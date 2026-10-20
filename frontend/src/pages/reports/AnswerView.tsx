import { Send, Star } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { Question } from '../../api/forms'
import { useAddComment, type ReportDetail } from '../../api/reports'
import { Avatar } from '../../components'
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
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

const ROLE = { teacher: 'Lärare', student: 'Elev', supervisor: 'Handledare' } as Record<string, string>

function timeAgo(iso: string) {
  return new Date(iso).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Kommentarstråden under ett inlägg, som i sociala medier. */
export function Comments({ report }: { report: ReportDetail }) {
  const [body, setBody] = useState('')
  const add = useAddComment(report.id)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim()) return
    add.mutate(body, { onSuccess: () => setBody('') })
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
              <div className={styles.bubble}>
                <p className={styles.commentMeta}>
                  <strong>{comment.author.name}</strong>
                  {comment.author_role !== 'student' && <span className={styles.role}>{ROLE[comment.author_role]}</span>}
                  <span className={styles.time}>{timeAgo(comment.created_at)}</span>
                </p>
                <p className={styles.commentBody}>{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className={styles.commentForm} onSubmit={submit}>
        <label htmlFor={`comment-${report.id}`} className="sr-only">
          Skriv en kommentar
        </label>
        <input
          id={`comment-${report.id}`}
          className={styles.commentInput}
          value={body}
          placeholder="Skriv en kommentar…"
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
      {add.isError && (
        <p className={styles.error} role="alert">
          {add.error.message}
        </p>
      )}
    </section>
  )
}
