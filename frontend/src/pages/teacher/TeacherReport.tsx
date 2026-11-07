import { ArrowUpRight, FolderOpen } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'

import type { Question } from '../../api/forms'
import { useMarkRead, useReport } from '../../api/reports'
import { ButtonLink, Card, Collapsible } from '../../components'
import { NotFound } from '../NotFound'
import { longDate, reportTitle } from '../reports/answers'
import { AnswerContent, Comments } from '../reports/AnswerView'
import { ReportSide } from './ReportSide'
import side from './ReportSide.module.css'
import { WeeklyReport } from './WeeklyReport'
import styles from './WeeklyReport.module.css'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Riktiga redovisningar har uuid. Demons skisser (F11) har korta id:n och visas som förut. */
export function ReportRoute() {
  const { reportId = '' } = useParams()
  return UUID.test(reportId) ? <TeacherReport reportId={reportId} /> : <WeeklyReport />
}

/** En elevs redovisning för läraren, enligt skissen larare-veckoredovisning.png. */
function TeacherReport({ reportId }: { reportId: string }) {
  const report = useReport(reportId)
  const markRead = useMarkRead(reportId)
  const unread = report.data?.is_read === false

  // Redovisningen räknas som läst när läraren öppnar den.
  const mark = markRead.mutate
  useEffect(() => {
    if (unread) mark()
  }, [unread, mark])

  if (report.isPending) return <p className={styles.missing}>Laddar redovisningen…</p>
  if (report.isError) return <NotFound what="Redovisningen" />
  const detail = report.data
  const answers = new Map(detail.answers.map((a) => [a.question_id, a]))
  const shown = detail.path
    .map((id) => detail.questions.find((q) => q.id === id))
    .filter((q): q is Question => !!q && q.type !== 'statement')
  const submitted = detail.submitted_at
    ? new Date(detail.submitted_at).toLocaleString('sv-SE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{reportTitle(detail.due_date)}</h1>
          <ButtonLink to={`/classes/${detail.class_id}?tab=reports`} icon={<ArrowUpRight aria-hidden="true" />}>
            Se alla
          </ButtonLink>
        </div>

        {detail.project && (
          <Link to={`/projects/${detail.project.id}`} className={side.projectBanner}>
            <span className={side.bannerIcon}>
              <FolderOpen aria-hidden="true" />
            </span>
            <span className={side.text}>
              <span className={side.bannerLabel}>Redovisningen hör till projektet</span>
              <span className={side.bannerName}>{detail.project.name}</span>
            </span>
            <span className={side.bannerAction}>
              Öppna projektet <ArrowUpRight aria-hidden="true" />
            </span>
          </Link>
        )}

        <Card>
          <div className={styles.projectBar}>
            <span>
              {detail.class_name} · {longDate(detail.due_date)}
            </span>
          </div>
          <div className={styles.answers}>
            {shown.map((question) => (
              <Collapsible key={question.id} title={question.title}>
                <AnswerContent question={question} answer={answers.get(question.id)} reportId={reportId} />
              </Collapsible>
            ))}
          </div>
        </Card>

        <Card className={styles.commentsCard}>
          <Comments report={detail} />
        </Card>
      </div>

      <ReportSide
        student={detail.student}
        className={detail.class_name}
        submitted={submitted}
        projectId={detail.project?.id}
      />
    </div>
  )
}
