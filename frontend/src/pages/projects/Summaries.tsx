import { summaryImageUrl, useProjectSummaries, type StudentSummary } from '../../api/projectSummaries'
import type { Project } from '../../api/projects'
import { StarRating } from '../../components'
import styles from './ProjectPage.module.css'
import { longDate } from './projectText'

/**
 * Elevernas sammanfattningar när projektet är klart (idé 12:6 steg 2, Texas skiss 2026-11-08).
 * Läraren och handledaren ser samma sak.
 */
function notAnswered(row: StudentSummary) {
  return row.reminded_at
    ? `har inte sammanfattat än · påminnelse skickad ${longDate(row.reminded_at.slice(0, 10))}`
    : 'har inte sammanfattat än'
}

/** En elevs sammanfattning: stjärnor, meningen och bilderna. */
export function SummaryCard({ project, row }: { project: Project; row: StudentSummary }) {
  const firstName = row.student.name.split(' ')[0]
  const summary = row.summary
  if (!summary) {
    return (
      <p className={styles.summaryMissing}>
        <strong>{row.student.name}</strong> {notAnswered(row)}
      </p>
    )
  }
  return (
    <section className={styles.box} aria-labelledby={`summary-${row.student.id}`}>
      <div className={styles.summaryHead}>
        <h2 id={`summary-${row.student.id}`} className={styles.boxTitle}>
          {firstName}s sammanfattning
        </h2>
        <StarRating value={summary.rating} label="Hur projektet gick" />
        <span className={styles.mutedSmall}>{longDate(summary.created_at.slice(0, 10))}</span>
      </div>
      <p className={styles.summaryBest}>”{summary.best}”</p>
      {summary.image_ids.length > 0 && (
        <ul className={styles.summaryImages}>
          {summary.image_ids.map((id, i) => (
            <li key={id}>
              <a href={summaryImageUrl(project.id, id)} target="_blank" rel="noreferrer">
                <img src={summaryImageUrl(project.id, id)} alt={`${firstName}s bild ${i + 1}`} loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Under "Alla": en rad per elev. Klick visar elevens helhet. */
export function SummaryList({ project, onStudent }: { project: Project; onStudent: (id: string) => void }) {
  const query = useProjectSummaries(project.id, Boolean(project.completed_at))
  if (!project.completed_at || !query.data || query.data.length === 0) return null
  const answered = query.data.filter((r) => r.summary).length
  return (
    <section className={styles.box} aria-labelledby="summaries-title">
      <div className={styles.summaryHead}>
        <h2 id="summaries-title" className={styles.boxTitle}>
          Sammanfattningar
        </h2>
        <span className={styles.mutedSmall}>
          {answered} av {query.data.length} har svarat
        </span>
      </div>
      <ul className={styles.summaryRows}>
        {query.data.map((row) => (
          <li key={row.student.id}>
            <button type="button" className={styles.summaryRow} onClick={() => onStudent(row.student.id)}>
              <span className={styles.summaryName}>{row.student.name}</span>
              {row.summary ? (
                <>
                  <StarRating value={row.summary.rating} label="Hur projektet gick" />
                  <span className={styles.summaryExcerpt}>”{row.summary.best}”</span>
                </>
              ) : (
                <span className={styles.summaryExcerpt}>{notAnswered(row)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
