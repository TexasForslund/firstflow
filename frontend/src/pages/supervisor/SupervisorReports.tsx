import { ChevronDown, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useSupervisorReports, type SupervisorReport } from '../../api/reports'
import { Avatar } from '../../components'
import { longDate } from '../reports/answers'
import styles from './SupervisorReports.module.css'

function commentText(count: number) {
  if (count === 0) return 'Inga kommentarer'
  return count === 1 ? '1 kommentar' : `${count} kommentarer`
}

const PAGE = 20

/**
 * Handledarens redovisningar (Texas skiss "Handledarens vy, del 2", 2026-11-03). Fliken Att läsa
 * med de olästa visas först. Alla visar 20 åt gången. Eleven väljs i en rullista.
 */
export function SupervisorReports() {
  const query = useSupervisorReports()
  const [params, setParams] = useSearchParams()
  const studentId = params.get('student') ?? ''
  const [shown, setShown] = useState(PAGE)
  const reports = query.data ?? []
  const unread = reports.filter((r) => !r.is_read)
  const show = params.get('show') ?? (unread.length > 0 ? 'unread' : 'all')
  const students = [...new Map(reports.map((r) => [r.student.id, r.student])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'sv'),
  )
  const list = (show === 'unread' ? unread : reports).filter((r) => !studentId || r.student.id === studentId)
  const visible = show === 'unread' ? list : list.slice(0, shown)

  function set(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setShown(PAGE)
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Redovisningar</h1>
        <p className={styles.subtitle}>Vad dina elever har skrivit om sina dagar hos er.</p>
      </header>

      {reports.length > 0 && (
        <div className={styles.filters}>
          <div className={styles.chips} role="group" aria-label="Visa">
            <button
              type="button"
              className={styles.chip}
              aria-pressed={show === 'unread'}
              onClick={() => set('show', 'unread')}
            >
              Att läsa <span className={styles.chipCount}>{unread.length}</span>
            </button>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={show === 'all'}
              onClick={() => set('show', 'all')}
            >
              Alla
            </button>
          </div>
          {students.length > 1 && (
            <label className={styles.studentSelect}>
              <span className="sr-only">Elev</span>
              <select value={studentId} onChange={(e) => set('student', e.target.value)}>
                <option value="">Alla elever</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
          )}
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

      {query.isSuccess && reports.length > 0 && show === 'unread' && (
        <p className={styles.state}>
          {list.length === 0 ? 'Du har läst allt. ' : 'Inga fler att läsa. '}
          <button type="button" className={styles.textButton} onClick={() => set('show', 'all')}>
            Visa alla redovisningar
          </button>
        </p>
      )}
      {show === 'all' && list.length > shown && (
        <button type="button" className={styles.moreButton} onClick={() => setShown(shown + PAGE)}>
          Visa fler ({list.length - shown} kvar)
        </button>
      )}
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
