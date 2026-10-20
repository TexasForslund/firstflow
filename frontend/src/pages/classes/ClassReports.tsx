import { ChevronRight, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import type { Person } from '../../api/classes'
import { useClassReports } from '../../api/reports'
import { Avatar, Card, SelectField } from '../../components'
import { longDate, reportTitle } from '../reports/answers'
import styles from './Classes.module.css'

/** Fliken Redovisningar: klassens inskickade redovisningar, olästa först. Bara för läraren. */
export function ClassReports({ classId, students }: { classId: string; students: Person[] }) {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [studentId, setStudentId] = useState('')
  const reports = useClassReports(classId, { unreadOnly, studentId: studentId || undefined })

  // Olästa först, sedan senast inskickade.
  const items = [...(reports.data ?? [])].sort((a, b) => Number(a.is_read) - Number(b.is_read))

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Redovisningar</h2>
        <span className={styles.count}>{reports.data?.length ?? ''}</span>
      </div>
      <div className={styles.reportFilters}>
        <div className={styles.segmented} role="group" aria-label="Visa">
          <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
            Alla
          </button>
          <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
            Olästa
          </button>
        </div>
        <SelectField label="Elev" value={studentId} onChange={setStudentId}>
          <option value="">Alla elever</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      </div>

      {reports.isPending ? (
        <p className={styles.empty}>Laddar redovisningar…</p>
      ) : reports.isError ? (
        <p className={styles.empty}>Redovisningarna gick inte att hämta. Ladda om sidan.</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>
          {unreadOnly
            ? 'Du har läst alla redovisningar.'
            : 'Inga inskickade redovisningar än. De visas här när eleverna skickar in.'}
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((report) => (
            <li key={report.id}>
              <Link to={`/reports/${report.id}`} className={`${styles.row} ${styles.reportRow}`}>
                <span className={styles.unreadDot} aria-hidden="true" data-unread={!report.is_read} />
                <Avatar name={report.student.name} />
                <span className={styles.rowText}>
                  <span className={styles.name}>
                    {report.student.name}
                    {!report.is_read && <span className="sr-only"> (oläst)</span>}
                  </span>
                  <span className={styles.meta}>
                    {reportTitle(report.due_date)} · {longDate(report.due_date)}
                  </span>
                </span>
                {report.is_late && <span className={styles.lateTag}>Sen</span>}
                {report.comment_count > 0 && (
                  <span className={styles.commentCount} aria-label={`${report.comment_count} kommentarer`}>
                    <MessageCircle aria-hidden="true" />
                    {report.comment_count}
                  </span>
                )}
                <ChevronRight aria-hidden="true" className={styles.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
