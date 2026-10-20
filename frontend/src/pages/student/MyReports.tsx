import { Check, ChevronRight, CircleCheckBig, MessageCircle } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { useMyReports, useReport, useStartReport, type DueReport } from '../../api/reports'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar } from '../../components'
import { answerText, longDate, parseDay, relativeDay, reportTitle } from '../reports/answers'
import styles from './Student.module.css'

/**
 * Elevens startsida, mobilen först i stil med sociala medier:
 * stories med redovisningsdagarna, kortet med det som ska göras och ett flöde med inlägg.
 */
export function MyReports() {
  const { data: user } = useCurrentUser()
  const reports = useMyReports()
  const start = useStartReport()
  const navigate = useNavigate()

  function open(item: DueReport) {
    if (item.status === 'submitted' && item.report_id) {
      navigate(`/my-reports/${item.report_id}`)
      return
    }
    start.mutate(
      { class_id: item.class_id, due_date: item.due_date },
      { onSuccess: (report) => navigate(`/my-reports/${report.id}/answer`) },
    )
  }

  const firstName = user?.name.split(' ')[0] ?? ''
  const items = reports.data ?? []
  const todo = items.filter((i) => i.status !== 'submitted')
  const next = todo[0]
  const posts = items.filter((i) => i.status === 'submitted' && i.report_id)
  const multipleClasses = new Set(items.map((i) => i.class_id)).size > 1

  return (
    <div className={styles.page}>
      <header className={styles.hello}>
        <h1 className={styles.helloTitle}>Hej {firstName}!</h1>
        <p className={styles.helloText}>
          {todo.length === 0
            ? 'Du har inget kvar att lämna.'
            : todo.length === 1
              ? 'Du har en redovisning att lämna.'
              : `Du har ${todo.length} redovisningar att lämna.`}
        </p>
      </header>

      {reports.isPending && <p className={styles.state}>Laddar…</p>}
      {reports.isError && <p className={styles.state}>Redovisningarna gick inte att hämta. Ladda om sidan.</p>}

      {items.length > 0 && (
        <nav className={styles.stories} aria-label="Redovisningsdagar">
          <ul>
            {items.map((item) => {
              const day = parseDay(item.due_date)
              const done = item.status === 'submitted'
              const label = `${reportTitle(item.due_date)}${multipleClasses ? `, ${item.class_name}` : ''}: ${
                done ? 'inskickad' : item.status === 'draft' ? 'påbörjad' : 'inte påbörjad'
              }${!done && item.is_late ? ', sen' : ''}`
              return (
                <li key={`${item.class_id}-${item.due_date}`}>
                  <button
                    type="button"
                    className={styles.story}
                    onClick={() => open(item)}
                    aria-label={label}
                    disabled={start.isPending}
                  >
                    <span className={`${styles.ring} ${done ? styles.ringDone : styles.ringTodo}`}>
                      <span className={styles.ringInner}>
                        <span className={styles.ringDay}>
                          {day.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '')}
                        </span>
                        <span className={styles.ringDate}>{day.getDate()}</span>
                      </span>
                      {done && (
                        <span className={styles.ringCheck}>
                          <Check aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className={`${styles.storyLabel} ${!done && item.is_late ? styles.late : ''}`}>
                      {!done && item.is_late ? 'Sen' : relativeDay(item.due_date)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      {reports.isSuccess &&
        (next ? (
          <section className={styles.next} aria-labelledby="next-title">
            <p className={styles.nextEyebrow}>
              {next.status === 'draft' ? 'Påbörjad' : 'Att lämna'}
              {next.is_late && <span className={styles.lateTag}>Sen</span>}
            </p>
            <h2 id="next-title" className={styles.nextTitle}>
              {reportTitle(next.due_date)}
            </h2>
            <p className={styles.nextMeta}>
              {next.class_name} · {longDate(next.due_date)}
            </p>
            <button type="button" className={styles.nextButton} onClick={() => open(next)} disabled={start.isPending}>
              {start.isPending ? 'Öppnar…' : next.status === 'draft' ? 'Fortsätt' : 'Starta'}
              <ChevronRight aria-hidden="true" />
            </button>
            {start.isError && (
              <p className={styles.error} role="alert">
                {start.error.message}
              </p>
            )}
          </section>
        ) : items.length > 0 ? (
          <section className={`${styles.next} ${styles.allDone}`}>
            <CircleCheckBig aria-hidden="true" className={styles.allDoneIcon} />
            <h2 className={styles.nextTitle}>Allt är inskickat</h2>
            <p className={styles.nextMeta}>Bra jobbat! Nästa redovisning dyker upp här.</p>
          </section>
        ) : (
          <section className={`${styles.next} ${styles.allDone}`}>
            <h2 className={styles.nextTitle}>Inga redovisningar än</h2>
            <p className={styles.nextMeta}>När läraren har lagt in frågor för din klass visas de här.</p>
          </section>
        ))}

      {posts.length > 0 && (
        <section aria-labelledby="feed-title" className={styles.feed}>
          <h2 id="feed-title" className={styles.feedTitle}>
            Dina inlägg
          </h2>
          <ul className={styles.posts}>
            {posts.map((item) => (
              <li key={item.report_id}>
                <PostCard item={item} authorName={user?.name ?? ''} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Ett inskickat inlägg i flödet, med de första svaren och antal kommentarer. */
function PostCard({ item, authorName }: { item: DueReport; authorName: string }) {
  const report = useReport(item.report_id!)
  const detail = report.data
  const answers = new Map(detail?.answers.map((a) => [a.question_id, a]) ?? [])
  const preview = (detail?.questions ?? [])
    .filter((q) => q.type !== 'statement' && answers.has(q.id))
    .slice(0, 2)
    .map((q) => ({ id: q.id, title: q.title, text: answerText(q, answers.get(q.id)) }))

  return (
    <Link to={`/my-reports/${item.report_id}`} className={styles.post}>
      <div className={styles.postHeader}>
        <Avatar name={authorName} size="sm" />
        <div className={styles.postWho}>
          <p className={styles.postTitle}>{reportTitle(item.due_date)}</p>
          <p className={styles.postMeta}>
            {item.class_name} · {longDate(item.due_date)}
          </p>
        </div>
        {item.is_late && <span className={styles.lateTag}>Sen</span>}
      </div>
      {preview.length > 0 && (
        <div className={styles.postBody}>
          {preview.map((p) => (
            <div key={p.id}>
              <p className={styles.postQuestion}>{p.title}</p>
              <p className={styles.postAnswer}>{p.text}</p>
            </div>
          ))}
        </div>
      )}
      <p className={styles.postFooter}>
        <MessageCircle aria-hidden="true" />
        {detail
          ? detail.comments.length === 0
            ? 'Inga kommentarer'
            : detail.comments.length === 1
              ? '1 kommentar'
              : `${detail.comments.length} kommentarer`
          : '…'}
      </p>
    </Link>
  )
}
