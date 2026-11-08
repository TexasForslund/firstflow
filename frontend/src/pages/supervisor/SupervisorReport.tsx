import { ArrowRight, ChevronLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import type { Question } from '../../api/forms'
import { useMarkRead, useReport, useSupervisorReports } from '../../api/reports'
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
  const list = useSupervisorReports()
  // Nästa olästa, räknat när sidan öppnades så att den inte byts när den här blir läst.
  const [saved, setSaved] = useState<{ reportId: string; items: { id: string; name: string }[] } | null>(null)
  if (list.isSuccess && saved?.reportId !== reportId) {
    setSaved({
      reportId,
      items: list.data.filter((r) => !r.is_read && r.id !== reportId).map((r) => ({ id: r.id, name: r.student.name })),
    })
  }
  const queue = saved?.reportId === reportId ? saved.items : null
  const next = queue?.[0]

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
      <div className={styles.backRow}>
        <Link to="/student-reports" className={styles.back}>
          <ChevronLeft aria-hidden="true" /> Redovisningar
        </Link>
        {queue && queue.length > 0 && (
          <span className={styles.meta}>
            {queue.length === 1 ? '1 till att läsa' : `${queue.length} till att läsa`}
          </span>
        )}
      </div>

      <header className={styles.reportHead}>
        <Avatar name={detail.student.name} />
        <span className={styles.who}>
          <h1 className={styles.reportTitle}>
            <Link to={`/supervised-students/${detail.student.id}`} className={styles.nameLink}>
              {detail.student.name}
            </Link>
          </h1>
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
              <AnswerContent question={question} answer={answers.get(question.id)} reportId={reportId} />
            </Collapsible>
          ))}
        </div>
      </Card>

      <Card>
        <div className={styles.commentsCard}>
          <Comments report={detail} />
        </div>
      </Card>

      {next && (
        <div className={styles.next}>
          <Link to={`/student-reports/${next.id}`} className={styles.nextLink}>
            Nästa: {next.name} <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  )
}
