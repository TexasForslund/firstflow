import { ChevronLeft } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'

import type { Question } from '../../api/forms'
import { useMarkRead, useReport } from '../../api/reports'
import { Avatar, Card, Collapsible } from '../../components'
import { NotFound } from '../NotFound'
import { longDate } from '../reports/answers'
import { AnswerContent, Comments } from '../reports/AnswerView'
import styles from './SupervisorReports.module.css'

/** En redovisning för handledaren: elevens svar och kommentarer (Texas skiss, 2026-10-29). */
export function SupervisorReport() {
  const { reportId = '' } = useParams()
  const report = useReport(reportId)
  const markRead = useMarkRead(reportId)
  const unread = report.data?.is_read === false

  // Redovisningen räknas som läst när handledaren öppnar den.
  const mark = markRead.mutate
  useEffect(() => {
    if (unread) mark()
  }, [unread, mark])

  if (report.isPending) return <p className={styles.state}>Laddar redovisningen…</p>
  if (report.isError) return <NotFound what="Redovisningen" />
  const detail = report.data
  const answers = new Map(detail.answers.map((a) => [a.question_id, a]))
  const shown = detail.path
    .map((id) => detail.questions.find((q) => q.id === id))
    .filter((q): q is Question => !!q && q.type !== 'statement')
  const day = longDate(detail.due_date)

  return (
    <div className={styles.page}>
      <Link to="/student-reports" className={styles.back}>
        <ChevronLeft aria-hidden="true" /> Redovisningar
      </Link>

      <header className={styles.reportHead}>
        <Avatar name={detail.student.name} />
        <span className={styles.who}>
          <h1 className={styles.reportTitle}>{detail.student.name}</h1>
          <span className={styles.meta}>
            {day.charAt(0).toUpperCase() + day.slice(1)} · {detail.class_name}
            {detail.project && <span className={styles.project}> · {detail.project.name}</span>}
          </span>
        </span>
      </header>

      <Card>
        <div className={styles.answers}>
          {shown.map((question) => (
            <Collapsible key={question.id} title={question.title}>
              <AnswerContent question={question} answer={answers.get(question.id)} />
            </Collapsible>
          ))}
        </div>
      </Card>

      <Card>
        <div className={styles.commentsCard}>
          <Comments report={detail} />
        </div>
      </Card>
    </div>
  )
}
