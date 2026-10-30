import { FolderKanban, MessageSquare, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useProject, useProjectReports, type Project, type ProjectReport } from '../../api/projects'
import { Avatar, Button, ButtonLink } from '../../components'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { ProjectGoalsTable } from '../goals/GoalViews'
import { ProjectDialog } from './ProjectDialog'
import styles from './ProjectPage.module.css'
import { daysLeftText, longDate, projectTone, reportsWord } from './projectText'

const PAGE = 10

/**
 * Projektets egen sida (Texas, 2026-10-29). Redovisningarna i projektet till vänster, om
 * projektet, eleverna och vem som kan ändra till höger. Läraren och inbjudna handledare ser
 * sidan.
 */
export function ProjectPage() {
  const { projectId = '' } = useParams()
  const query = useProject(projectId)
  const navigate = useNavigate()
  const { data: user } = useCurrentUser()
  const [editing, setEditing] = useState(false)

  if (query.isPending) return <p className={styles.state}>Laddar projektet…</p>
  if (query.isError) {
    return (
      <div className={styles.page}>
        <p className={styles.breadcrumb}>
          <Link to="/projects">Projekt</Link>
        </p>
        <p className={styles.state}>Projektet finns inte, eller så har du inte tillgång till det.</p>
      </div>
    )
  }
  const project = query.data

  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link to="/projects">Projekt</Link> / {project.name}
      </p>

      <header className={styles.header}>
        <span className={styles.icon} data-tone={projectTone(project.id)}>
          <FolderKanban aria-hidden="true" />
        </span>
        <div className={styles.heading}>
          <h1 className={styles.title}>
            {project.name}
            {project.completed_at && <span className={styles.doneBadge}>Avslutat</span>}
          </h1>
          {project.tags.length > 0 && (
            <div className={styles.tags}>
              {project.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <Button icon={<Pencil aria-hidden="true" />} onClick={() => setEditing(true)}>
          Ändra projekt
        </Button>
      </header>

      <Facts project={project} />

      <ProjectGoalsTable
        projectId={project.id}
        reportPath={(id) => (user?.role === 'supervisor' ? `/student-reports/${id}` : `/reports/${id}`)}
      />

      <div className={styles.columns}>
        <ReportsSection project={project} />

        <div className={styles.side}>
          <section className={styles.box} aria-labelledby="about-title">
            <h2 id="about-title" className={styles.boxTitle}>
              Om projektet
            </h2>
            <p className={styles.description}>{project.description || 'Ingen beskrivning än.'}</p>
          </section>

          <section className={styles.box} aria-labelledby="students-title">
            <h2 id="students-title" className={styles.boxTitle}>
              Elever
            </h2>
            {project.students.length === 0 && <p className={styles.muted}>Inga elever i projektet än.</p>}
            <ul className={styles.people}>
              {project.students.map((s) => {
                const inner = (
                  <>
                    <Avatar name={s.name} size="sm" />
                    <span className={styles.personName}>{s.name}</span>
                  </>
                )
                return (
                  <li key={s.id}>
                    {project.is_owner ? (
                      <Link to={`/students/${s.id}`} className={styles.person}>
                        {inner}
                      </Link>
                    ) : (
                      <span className={styles.person}>{inner}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className={styles.box} aria-labelledby="who-title">
            <h2 id="who-title" className={styles.boxTitle}>
              Vem kan ändra
            </h2>
            <p className={styles.muted}>
              {project.owner.name} (lärare, skapade projektet)
              {project.supervisors.length > 0 &&
                ` och ${project.supervisors.map((s) => s.name).join(', ')} (handledare${
                  project.workplace ? `, ${project.workplace.name}` : ''
                })`}
              . Bara läraren ändrar vilka elever som är med.
            </p>
          </section>
        </div>
      </div>

      {editing && (
        <ProjectDialog project={project} onClose={() => setEditing(false)} onDeleted={() => navigate('/projects')} />
      )}
    </div>
  )
}

function Facts({ project }: { project: Project }) {
  return (
    <dl className={styles.facts}>
      <div className={styles.fact}>
        <dt>Företag</dt>
        <dd className={styles.factValue}>{project.workplace?.name ?? 'Inget företag'}</dd>
      </div>
      <div className={styles.fact}>
        <dt>Klart senast</dt>
        <dd className={styles.factValue}>{project.deadline ? longDate(project.deadline) : 'Inget slutdatum'}</dd>
        {project.deadline && !project.completed_at && <dd>{daysLeftText(project.deadline)}</dd>}
      </div>
      <div className={styles.fact}>
        <dt>Redovisningar</dt>
        <dd className={styles.factValue}>
          {project.report_count}
          {project.is_owner && project.unread_count > 0 && (
            <span className={styles.unread}>
              {' '}
              {project.unread_count} {project.unread_count === 1 ? 'oläst' : 'olästa'}
            </span>
          )}
        </dd>
      </div>
      <div className={styles.fact}>
        <dt>Ansvariga</dt>
        <dd className={styles.factValue}>{project.owner.name}</dd>
        {project.supervisors.length > 0 && (
          <dd>och {project.supervisors.map((s) => s.name).join(', ')} (handledare)</dd>
        )}
      </div>
    </dl>
  )
}

function ReportsSection({ project }: { project: Project }) {
  const [studentId, setStudentId] = useState<string | undefined>()
  const [shown, setShown] = useState(PAGE)
  const reports = useProjectReports(project.id, studentId)
  const rows = reports.data ?? []

  return (
    <section className={styles.main} aria-labelledby="reports-title">
      <div className={styles.reportsHead}>
        <h2 id="reports-title" className={styles.sectionTitle}>
          Redovisningar i projektet
        </h2>
        {project.students.length > 1 && (
          <div role="group" aria-label="Elev" className={styles.segments}>
            <button
              type="button"
              className={styles.segment}
              aria-pressed={studentId === undefined}
              onClick={() => setStudentId(undefined)}
            >
              Alla
            </button>
            {project.students.map((s) => (
              <button
                key={s.id}
                type="button"
                className={styles.segment}
                aria-pressed={studentId === s.id}
                onClick={() => setStudentId(s.id)}
              >
                {s.name.split(' ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {reports.isPending && <p className={styles.muted}>Hämtar redovisningar…</p>}
      {reports.isError && <p className={styles.muted}>Redovisningarna gick inte att hämta.</p>}
      {reports.isSuccess && rows.length === 0 && (
        <p className={styles.emptyBox}>Inga redovisningar i projektet än. De dyker upp här när eleverna skickar in.</p>
      )}
      {rows.slice(0, shown).map((report) => (
        <ReportCard key={report.id} report={report} canOpen={project.is_owner} />
      ))}
      {rows.length > shown && (
        <Button className={styles.more} onClick={() => setShown(shown + PAGE)}>
          Visa fler
        </Button>
      )}
      {reports.isSuccess && rows.length > 0 && (
        <p className={styles.muted}>
          {rows.length} {reportsWord(rows.length)}
        </p>
      )}
    </section>
  )
}

function dayText(iso: string) {
  const text = new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function submittedText(iso: string) {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  const today = new Date().toDateString() === date.toDateString()
  return today
    ? `inskickad i dag ${time}`
    : `inskickad ${date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${time}`
}

function ReportCard({ report, canOpen }: { report: ProjectReport; canOpen: boolean }) {
  return (
    <article className={styles.report}>
      <div className={styles.reportBody}>
        <div className={styles.reportTop}>
          <Avatar name={report.student.name} />
          <span className={styles.reportWho}>
            <span className={styles.personName}>{report.student.name}</span>
            <span className={styles.mutedSmall}>
              {dayText(report.due_date)} · {submittedText(report.submitted_at)}
            </span>
          </span>
          {report.is_read === false && <span className={styles.unreadBadge}>Oläst</span>}
        </div>
        {report.answers.length === 0 && <p className={styles.muted}>Inga textsvar.</p>}
        {report.answers.map((answer) => (
          <div key={answer.question_id} className={styles.answer}>
            <p className={styles.question}>{answer.question}</p>
            <p className={styles.answerText}>{answer.text}</p>
          </div>
        ))}
      </div>
      <div className={styles.reportFooter}>
        <span>
          <MessageSquare aria-hidden="true" />{' '}
          {report.comment_count === 0
            ? 'Inga kommentarer'
            : `${report.comment_count} ${report.comment_count === 1 ? 'kommentar' : 'kommentarer'}`}
        </span>
        {canOpen && (
          <ButtonLink to={`/reports/${report.id}`} variant="soft">
            Öppna
          </ButtonLink>
        )}
      </div>
    </article>
  )
}
