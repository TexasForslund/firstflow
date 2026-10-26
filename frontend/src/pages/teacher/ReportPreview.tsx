import { ArrowUpRight, MessageCircle } from 'lucide-react'

import type { OverviewReport } from '../../api/overview'
import { Avatar, ButtonLink, Card, CardFooter } from '../../components'
import styles from './ReportPreview.module.css'

function submittedText(iso: string) {
  const at = new Date(iso)
  const time = at.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (at.toDateString() === today.toDateString()) return `I dag ${time}`
  if (at.toDateString() === yesterday.toDateString()) return `I går ${time}`
  return `${at.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}

/** Kort med de två första textsvaren i en veckoredovisning. Det andra tonas ut. */
export function ReportPreview({ report }: { report: OverviewReport }) {
  const { student } = report

  return (
    <Card>
      <article aria-labelledby={`report-${report.id}`}>
        <div className={styles.body}>
          <header className={styles.header}>
            <Avatar name={student.name} />
            <div>
              <p className={styles.name}>
                <span id={`report-${report.id}`}>{student.name}</span>
                <span className={styles.className}>{report.class_name}</span>
              </p>
              <p className={styles.meta}>
                {submittedText(report.submitted_at)}
                {report.is_late ? ' · Sen' : ''}
              </p>
            </div>
          </header>
          {report.preview.length > 0 && (
            <div className={styles.answers}>
              {report.preview.map((answer, i) => (
                <div key={i} className={i === 1 ? styles.faded : undefined} aria-hidden={i === 1}>
                  <p className={styles.question}>{answer.question}</p>
                  <p className={styles.text}>{answer.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <CardFooter align="between">
          <span className={styles.attachments}>
            <MessageCircle aria-hidden="true" />
            {report.comment_count > 0
              ? `${report.comment_count} ${report.comment_count === 1 ? 'kommentar' : 'kommentarer'}`
              : 'Inga kommentarer'}
          </span>
          <ButtonLink
            to={`/reports/${report.id}`}
            variant="soft"
            icon={<ArrowUpRight aria-hidden="true" />}
            aria-label={`Öppna veckoredovisningen från ${student.name}`}
          >
            Öppna
          </ButtonLink>
        </CardFooter>
      </article>
    </Card>
  )
}
