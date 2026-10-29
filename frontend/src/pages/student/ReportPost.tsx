import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'

import { useReport } from '../../api/reports'
import { Avatar } from '../../components'
import { NotFound } from '../NotFound'
import { longDate, reportTitle } from '../reports/answers'
import { AnswerView, Comments } from '../reports/AnswerView'
import styles from './Student.module.css'

/** En inskickad redovisning som inlägg, med kommentarer från eleven och läraren. */
export function ReportPost() {
  const { reportId = '' } = useParams()
  const report = useReport(reportId)

  if (report.isPending) return <p className={styles.state}>Laddar…</p>
  if (report.isError) return <NotFound what="Redovisningen" />
  const detail = report.data
  if (detail.status === 'draft') return <Navigate to={`/my-reports/${reportId}/answer`} replace />

  return (
    <div className={styles.page}>
      <Link to="/my-reports" className={styles.backLink}>
        <ArrowLeft aria-hidden="true" /> Tillbaka
      </Link>
      <article className={styles.postFull}>
        <header className={styles.postHeader}>
          <Avatar name={detail.student.name} size="md" />
          <div className={styles.postWho}>
            <h1 className={styles.postFullTitle}>{reportTitle(detail.due_date)}</h1>
            <p className={styles.postMeta}>
              {detail.class_name} · {longDate(detail.due_date)}
              {detail.project && ` · ${detail.project.name}`}
            </p>
          </div>
          <span className={styles.doneTag}>Inskickad</span>
        </header>
        <AnswerView report={detail} />
      </article>
      <div className={styles.postFull}>
        <Comments report={detail} />
      </div>
    </div>
  )
}
