import { ArrowUpRight, FolderOpen, MessageCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { usePlacementGroup } from '../../api/messages'
import { useStudentProjects } from '../../api/projects'
import { useStudentPlacements } from '../../api/students'
import { Avatar, CompanyLogo } from '../../components'
import { listTime } from '../messages/messageTime'
import { currentPlacement, periodText, periodWeek } from '../placements/period'
import styles from './ReportSide.module.css'

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.box} aria-label={title}>
      <h2 className={styles.boxTitle}>{title}</h2>
      {children}
    </section>
  )
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

/** Hur långt projektet har kommit mellan start och slutdatum, 0–100. */
function progress(created: string, deadline: string | null) {
  if (!deadline) return null
  const start = new Date(created).getTime()
  const end = new Date(`${deadline}T23:59:59`).getTime()
  if (end <= start) return 100
  return Math.round(Math.min(1, Math.max(0, (Date.now() - start) / (end - start))) * 100)
}

/**
 * Högersidan i lärarens redovisning (Texas skiss "Elevkortet i redovisningen", 2026-11-03):
 * fyra rutor med eleven, praktikplatsen, projekten och meddelanden. Redovisningen själv hålls enkel.
 */
export function ReportSide({
  student,
  className,
  submitted,
  projectId,
}: {
  student: { id: string; name: string }
  className: string
  submitted: string
  projectId?: string
}) {
  const firstName = student.name.split(' ')[0]
  const placements = useStudentPlacements(student.id)
  const placement = currentPlacement(placements.data ?? [])
  const projects = useStudentProjects(student.id)
  const group = usePlacementGroup(student.id)

  const ongoing = (projects.data ?? []).filter((p) => !p.completed_at || p.id === projectId)
  // Projektet som redovisningen hör till överst.
  ongoing.sort((a, b) => Number(b.id === projectId) - Number(a.id === projectId))
  const period = placement ? periodWeek(placement.start_date, placement.end_date) : null

  return (
    <aside className={styles.side} aria-label={`Om ${student.name}`}>
      <Box title="Eleven">
        <div className={styles.person}>
          <Avatar name={student.name} size="lg" />
          <span className={styles.text}>
            <span className={styles.name}>{student.name}</span>
            <span className={styles.muted}>
              {className}
              {submitted && ` · inskickad ${submitted}`}
            </span>
          </span>
        </div>
        <Link to={`/students/${student.id}`} className={styles.pill}>
          Elevens sida <ArrowUpRight aria-hidden="true" />
        </Link>
      </Box>

      <Box title="Praktikplats">
        {placements.isPending ? (
          <p className={styles.muted}>Hämtar…</p>
        ) : placement ? (
          <>
            <div className={styles.person}>
              <CompanyLogo name={placement.workplace.name} logoUrl={placement.workplace.logo_url} size="lg" />
              <span className={styles.text}>
                <span className={styles.name}>{placement.workplace.name}</span>
                <span className={styles.muted}>Handledare {placement.supervisor.name}</span>
              </span>
            </div>
            {period && (
              <div className={styles.period}>
                <span className={styles.periodRow}>
                  <span className={styles.muted}>{periodText(placement.start_date, placement.end_date)}</span>
                  <span className={styles.strong}>
                    Vecka {period.week} av {period.weeks}
                  </span>
                </span>
                <span className={styles.bar} aria-hidden="true">
                  <span style={{ width: `${Math.round((period.week / Math.max(1, period.weeks)) * 100)}%` }} />
                </span>
              </div>
            )}
          </>
        ) : (
          <p className={styles.muted}>{firstName} har ingen praktikplats just nu.</p>
        )}
      </Box>

      <Box title="Projekt">
        {projects.isPending ? (
          <p className={styles.muted}>Hämtar…</p>
        ) : ongoing.length === 0 ? (
          <p className={styles.muted}>{firstName} är inte med i något pågående projekt.</p>
        ) : (
          <ul className={styles.projects}>
            {ongoing.map((p) => {
              const others = p.students.filter((s) => s.id !== student.id).map((s) => s.name.split(' ')[0])
              const done = progress(p.created_at, p.deadline)
              const current = p.id === projectId
              return (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className={styles.project} data-current={current ? '' : undefined}>
                    {current && <span className={styles.currentTag}>Den här redovisningen</span>}
                    <span className={styles.projectHead}>
                      <span className={styles.projectIcon}>
                        <FolderOpen aria-hidden="true" />
                      </span>
                      <span className={styles.text}>
                        <span className={styles.name}>{p.name}</span>
                        <span className={styles.muted}>
                          {[
                            others.length > 0 && `Med ${others.join(', ')}`,
                            p.deadline && `klart ${shortDate(p.deadline)}`,
                            p.completed_at && 'avslutat',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <ArrowUpRight aria-hidden="true" className={styles.arrow} />
                    </span>
                    {current && (
                      <span className={styles.projectFoot}>
                        {done !== null && (
                          <span className={styles.bar} data-tone="green" aria-hidden="true">
                            <span style={{ width: `${done}%` }} />
                          </span>
                        )}
                        <span className={styles.muted}>
                          {p.report_count} {p.report_count === 1 ? 'redovisning' : 'redovisningar'}
                        </span>
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Box>

      <Box title="Meddelanden">
        {group.data && (
          <Link to={`/messages/${group.data.id}`} className={styles.message}>
            <span className={styles.messageIcon}>
              <MessageCircle aria-hidden="true" />
            </span>
            <span className={styles.text}>
              <span className={styles.messageTop}>
                <span className={styles.strong}>{group.data.title}</span>
                <span className={styles.muted}>{listTime(group.data.last_message_at)}</span>
              </span>
              <span className={styles.preview}>{group.data.preview ?? 'Inga meddelanden än'}</span>
            </span>
            {group.data.unread > 0 && <span className={styles.unread}>{group.data.unread}</span>}
          </Link>
        )}
        <div className={styles.buttons}>
          {group.data && (
            <Link to={`/messages/${group.data.id}`} className={styles.primary}>
              <MessageCircle aria-hidden="true" /> Skriv i gruppen
            </Link>
          )}
          <Link to={`/messages?to=${student.id}`} className={group.data ? styles.pill : styles.primary}>
            Skriv till {firstName}
          </Link>
        </div>
      </Box>
    </aside>
  )
}
