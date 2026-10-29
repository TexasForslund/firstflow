import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useSupervisorReports, type SupervisorReport } from '../../api/reports'
import { Avatar } from '../../components'
import { longDate } from '../reports/answers'
import styles from './SupervisorReports.module.css'

function commentText(count: number) {
  if (count === 0) return 'Inga kommentarer'
  return count === 1 ? '1 kommentar' : `${count} kommentarer`
}

/**
 * Handledarens redovisningar (Texas skiss, 2026-10-29): ett flöde med elevernas inlägg från
 * tiden hos handledaren. Nya inlägg har en prick, och det går att välja en elev i taget.
 */
export function SupervisorReports() {
  const query = useSupervisorReports()
  const [studentId, setStudentId] = useState<string | null>(null)
  const reports = query.data ?? []
  const unread = reports.filter((r) => !r.is_read).length
  const students = [...new Map(reports.map((r) => [r.student.id, r.student])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'sv'),
  )
  const visible = studentId ? reports.filter((r) => r.student.id === studentId) : reports

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Redovisningar</h1>
        <p className={styles.subtitle}>
          Vad dina elever har skrivit om sina dagar hos er.
          {unread > 0 && ` ${unread === 1 ? '1 ny' : `${unread} nya`} att läsa.`}
        </p>
      </header>

      {students.length > 1 && (
        <div className={styles.chips} role="group" aria-label="Elev">
          <button
            type="button"
            className={styles.chip}
            aria-pressed={studentId === null}
            onClick={() => setStudentId(null)}
          >
            Alla elever
          </button>
          {students.map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.chip}
              aria-pressed={studentId === s.id}
              onClick={() => setStudentId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {query.isPending && <p className={styles.state}>Laddar redovisningarna…</p>}
      {query.isError && <p className={styles.state}>Redovisningarna gick inte att hämta. Ladda om sidan.</p>}
      {query.isSuccess && reports.length === 0 && (
        <p className={styles.empty}>
          Inga redovisningar än. När dina elever skickar in en redovisning under tiden hos er visas den här.
        </p>
      )}

      {visible.map((report) => (
        <Post key={report.id} report={report} />
      ))}
    </div>
  )
}

function Post({ report }: { report: SupervisorReport }) {
  const day = longDate(report.due_date)
  return (
    <Link to={`/student-reports/${report.id}`} className={styles.post}>
      <span className={styles.postHead}>
        <Avatar name={report.student.name} size="sm" />
        <span className={styles.who}>
          <span className={styles.name}>{report.student.name}</span>
          <span className={styles.meta}>
            {day.charAt(0).toUpperCase() + day.slice(1)}
            {report.project && <span className={styles.project}> · {report.project.name}</span>}
          </span>
        </span>
        {!report.is_read && (
          <span className={styles.dot}>
            <span className="sr-only">Ny</span>
          </span>
        )}
      </span>
      {report.excerpt && (
        <span className={styles.body}>
          <span className={styles.question}>{report.excerpt.question}</span>
          <span className={styles.answer}>{report.excerpt.text}</span>
        </span>
      )}
      <span className={styles.footer}>
        <span className={styles.comments}>
          <MessageCircle aria-hidden="true" />
          {commentText(report.comment_count)}
        </span>
        <span className={styles.action}>Läs och kommentera</span>
      </span>
    </Link>
  )
}
