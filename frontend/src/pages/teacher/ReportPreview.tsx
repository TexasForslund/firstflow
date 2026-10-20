import { ArrowUpRight, Image } from 'lucide-react'

import { Avatar, ButtonLink, Card, CardFooter } from '../../components'
import { classById, studentById, type DemoReport } from '../../demo/data'
import styles from './ReportPreview.module.css'

/** Kort med de två första textsvaren i en veckoredovisning. Det andra tonas ut. */
export function ReportPreview({ report }: { report: DemoReport }) {
  const student = studentById(report.studentId)
  if (!student) return null
  const texts = report.answers.filter((a) => a.type === 'text').slice(0, 2)
  const imageCount = report.answers.reduce((n, a) => n + (a.images?.length ?? 0), 0)

  return (
    <Card>
      <article aria-labelledby={`report-${report.id}`}>
        <div className={styles.body}>
          <header className={styles.header}>
            <Avatar name={student.name} />
            <div>
              <p className={styles.name}>
                <span id={`report-${report.id}`}>{student.name}</span>
                <span className={styles.className}>{classById(student.classId)?.name}</span>
              </p>
              <p className={styles.meta}>
                {report.submittedAt} · APL-vecka {report.aplWeek}
              </p>
            </div>
          </header>
          <div className={styles.answers}>
            {texts.map((answer, i) => (
              <div key={answer.question} className={i === 1 ? styles.faded : undefined} aria-hidden={i === 1}>
                <p className={styles.question}>{answer.question}</p>
                <p className={styles.text}>{answer.text}</p>
              </div>
            ))}
          </div>
        </div>
        <CardFooter align="between">
          <span className={styles.attachments}>
            <Image aria-hidden="true" />
            {imageCount > 0 ? `Bilagor (${imageCount})` : 'Inga bilagor'}
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
