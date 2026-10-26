import { ArrowUpRight, BriefcaseBusiness } from 'lucide-react'
import { useEffect } from 'react'
import { useParams } from 'react-router'

import type { Question } from '../../api/forms'
import { useMarkRead, useReport } from '../../api/reports'
import { useStudentPlacements } from '../../api/students'
import { Avatar, ButtonLink, Card, CardFooter, Collapsible } from '../../components'
import { NotFound } from '../NotFound'
import { currentPlacement, periodText } from '../placements/period'
import { longDate, reportTitle } from '../reports/answers'
import { AnswerContent, Comments } from '../reports/AnswerView'
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
  const firstName = detail.student.name.split(' ')[0]
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

        <Card>
          <div className={styles.projectBar}>
            <span>
              {detail.class_name} · {longDate(detail.due_date)}
            </span>
            {detail.is_late && <span className={styles.lateTag}>Sen</span>}
          </div>
          <div className={styles.answers}>
            {shown.map((question) => (
              <Collapsible key={question.id} title={question.title}>
                <AnswerContent question={question} answer={answers.get(question.id)} />
              </Collapsible>
            ))}
          </div>
        </Card>

        <Card className={styles.commentsCard}>
          <Comments report={detail} />
        </Card>
      </div>

      <aside className={styles.side} aria-label={`Om ${detail.student.name}`}>
        <Card>
          <div className={styles.sideBody}>
            <div className={styles.studentHeader}>
              <Avatar name={detail.student.name} />
              <span className={styles.studentName}>{detail.student.name}</span>
              <span className={styles.studentClass}>{detail.class_name}</span>
            </div>
            <p className={styles.submitted}>Inskickad {submitted}</p>

            <h2 className={styles.sideHeading}>Praktikplats kopplad till {firstName}</h2>
            <StudentWorkplace studentId={detail.student.id} />
          </div>
          <CardFooter>
            <ButtonLink to={`/students/${detail.student.id}`} icon={<ArrowUpRight aria-hidden="true" />}>
              Se elevens sida
            </ButtonLink>
          </CardFooter>
        </Card>
      </aside>
    </div>
  )
}

function StudentWorkplace({ studentId }: { studentId: string }) {
  const placements = useStudentPlacements(studentId)
  const current = currentPlacement(placements.data ?? [])
  return (
    <p className={styles.notYet}>
      <BriefcaseBusiness aria-hidden="true" />{' '}
      {placements.isPending
        ? 'Hämtar…'
        : current
          ? `${current.workplace.name}, ${periodText(current.start_date, current.end_date)}`
          : 'Ingen praktikplats tilldelad än'}
    </p>
  )
}
