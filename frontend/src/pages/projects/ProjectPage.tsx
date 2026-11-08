import { FolderKanban, MessageSquare, Pencil } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import {
  goalNames,
  useProject,
  useProjectComments,
  useProjectImages,
  useProjectReports,
  type Project,
  type ProjectReport,
} from '../../api/projects'
import { useProjectSummaries } from '../../api/projectSummaries'
import { Avatar, Button, ButtonLink, CompanyLogo } from '../../components'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { ProjectGoalsTable, StudentProjectGoals } from '../goals/GoalViews'
import { CommentsTab, ImagesTab } from './ProjectTabs'
import { SummaryCard, SummaryList } from './Summaries'
import { ProjectDialog } from './ProjectDialog'
import styles from './ProjectPage.module.css'
import { daysLeftText, longDate, projectTone, reportsWord } from './projectText'

const PAGE = 10

type Tab = 'overview' | 'reports' | 'images' | 'comments'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Översikt' },
  { id: 'reports', label: 'Redovisningar' },
  { id: 'images', label: 'Bilder' },
  { id: 'comments', label: 'Kommentarer' },
]

/**
 * Projektets egen sida (Texas, 2026-10-29). Läraren och inbjudna handledare ser den.
 *
 * Överst väljer man elev och sedan flik: Översikt, Redovisningar, Bilder och Kommentarer
 * (Texas skiss "Sammanfattning av projekt", 2026-11-07). Valet av elev gäller alla flikar, så att
 * man ser en elevs helhet i projektet. Med bara en elev visas inget elevval.
 */
export function ProjectPage() {
  const { projectId = '' } = useParams()
  const query = useProject(projectId)
  const navigate = useNavigate()
  const { data: user } = useCurrentUser()
  const [editing, setEditing] = useState(false)
  const [params, setParams] = useSearchParams()

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
  // Alla i projektet utom du: eleverna, handledarna och läraren.
  const others = [...project.students, ...project.supervisors, project.owner]
    .map((p) => p.id)
    .filter((id, i, all) => id !== user?.id && all.indexOf(id) === i)
  const single = project.students.length === 1
  const chosen = project.students.find((s) => s.id === params.get('elev'))
  const student = single ? project.students[0] : chosen
  const tab = (TABS.find((t) => t.id === params.get('flik'))?.id ?? 'overview') as Tab
  const reportPath = (id: string) => (user?.role === 'supervisor' ? `/student-reports/${id}` : `/reports/${id}`)

  function choose(next: { elev?: string | null; flik?: Tab }) {
    const p = new URLSearchParams(params)
    if (next.elev !== undefined) {
      if (next.elev) p.set('elev', next.elev)
      else p.delete('elev')
    }
    if (next.flik) {
      if (next.flik === 'overview') p.delete('flik')
      else p.set('flik', next.flik)
    }
    setParams(p, { replace: true })
  }

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
          {goalNames(project).length > 0 && (
            <div className={styles.tags}>
              {goalNames(project).map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        {others.length > 0 && (
          <ButtonLink
            to={`/messages?to=${others.join(',')}&project=${project.id}`}
            icon={<MessageSquare aria-hidden="true" />}
          >
            Skicka meddelande
          </ButtonLink>
        )}
        <Button icon={<Pencil aria-hidden="true" />} onClick={() => setEditing(true)}>
          Ändra projekt
        </Button>
      </header>

      {project.students.length > 1 && (
        <div role="group" aria-label="Elev" className={styles.picker}>
          <span className={styles.pickerLabel}>Elev</span>
          <button
            type="button"
            className={styles.segment}
            aria-pressed={!student}
            onClick={() => choose({ elev: null })}
          >
            Alla
          </button>
          {project.students.map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.segment}
              aria-pressed={student?.id === s.id}
              onClick={() => choose({ elev: s.id })}
            >
              {s.name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      <Tabs project={project} studentId={student?.id} tab={tab} onTab={(flik) => choose({ flik })} />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.panel}>
        {tab === 'overview' &&
          (student ? (
            <StudentOverview project={project} student={student} reportPath={reportPath} />
          ) : (
            <Overview project={project} reportPath={reportPath} onStudent={(id) => choose({ elev: id })} />
          ))}
        {tab === 'reports' && <ReportsSection project={project} studentId={student?.id} reportPath={reportPath} />}
        {tab === 'images' && <ImagesTab project={project} studentId={student?.id} reportPath={reportPath} />}
        {tab === 'comments' && <CommentsTab project={project} studentId={student?.id} />}
      </div>

      {editing && (
        <ProjectDialog project={project} onClose={() => setEditing(false)} onDeleted={() => navigate('/projects')} />
      )}
    </div>
  )
}

/** Flikarna, med antal för den valda eleven. Pilarna flyttar mellan flikarna. */
function Tabs({
  project,
  studentId,
  tab,
  onTab,
}: {
  project: Project
  studentId?: string
  tab: Tab
  onTab: (tab: Tab) => void
}) {
  const reports = useProjectReports(project.id, studentId)
  const images = useProjectImages(project.id)
  const comments = useProjectComments(project.id)
  const mine = <T extends { student: { id: string } }>(rows: T[] | undefined) =>
    rows?.filter((r) => !studentId || r.student.id === studentId).length
  const counts: Record<Tab, number | undefined> = {
    overview: undefined,
    reports: studentId ? reports.data?.length : project.report_count,
    images: mine(images.data),
    comments: mine(comments.data),
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.id === tab)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = TABS[(i + step + TABS.length) % TABS.length]
    onTab(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  return (
    <div role="tablist" aria-label="Projektet" className={styles.tabs} onKeyDown={onKeyDown}>
      {TABS.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          className={styles.tab}
          onClick={() => onTab(t.id)}
        >
          {t.label}
          {counts[t.id] !== undefined && counts[t.id]! > 0 && <span className={styles.tabCount}>{counts[t.id]}</span>}
        </button>
      ))}
    </div>
  )
}

/** Översikten för alla elever: fakta, målen och om projektet. */
function Overview({
  project,
  reportPath,
  onStudent,
}: {
  project: Project
  reportPath: (id: string) => string
  onStudent: (id: string) => void
}) {
  return (
    <>
      <Facts project={project} />
      <SummaryList project={project} onStudent={onStudent} />
      <ProjectGoalsTable projectId={project.id} reportPath={reportPath} onStudent={onStudent} />
      <div className={styles.boxes}>
        <About project={project} />
        <section className={styles.box} aria-labelledby="students-title">
          <h2 id="students-title" className={styles.boxTitle}>
            Elever
          </h2>
          {project.students.length === 0 && <p className={styles.muted}>Inga elever i projektet än.</p>}
          <ul className={styles.people}>
            {project.students.map((s) => (
              <li key={s.id}>
                <button type="button" className={styles.person} onClick={() => onStudent(s.id)}>
                  <Avatar name={s.name} size="sm" />
                  <span className={styles.personName}>{s.name}</span>
                </button>
              </li>
            ))}
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
    </>
  )
}

function About({ project }: { project: Project }) {
  return (
    <section className={styles.box} aria-labelledby="about-title">
      <h2 id="about-title" className={styles.boxTitle}>
        Om projektet
      </h2>
      <p className={styles.description}>{project.description || 'Ingen beskrivning än.'}</p>
    </section>
  )
}

/** En elevs helhet i projektet: målen med läroplanen och om projektet. */
function StudentOverview({
  project,
  student,
  reportPath,
}: {
  project: Project
  student: Project['students'][number]
  reportPath: (id: string) => string
}) {
  const { data: user } = useCurrentUser()
  const reports = useProjectReports(project.id, student.id)
  const latest = reports.data?.[0]
  const firstName = student.name.split(' ')[0]
  const studentPage = user?.role === 'supervisor' ? `/supervised-students/${student.id}` : `/students/${student.id}`
  const summaries = useProjectSummaries(project.id, Boolean(project.completed_at))
  const summary = summaries.data?.find((r) => r.student.id === student.id)
  return (
    <>
      <div className={styles.studentHead}>
        <Avatar name={student.name} />
        <span className={styles.studentWho}>
          <span className={styles.studentName}>{student.name}</span>
          {reports.isSuccess && (
            <span className={styles.muted}>
              {reports.data.length} {reportsWord(reports.data.length)} i projektet
              {latest && ` · senast ${longDate(latest.due_date)}`}
            </span>
          )}
        </span>
        <ButtonLink to={studentPage}>Elevens sida</ButtonLink>
      </div>
      {summary && <SummaryCard project={project} row={summary} />}
      <StudentProjectGoals
        projectId={project.id}
        studentId={student.id}
        firstName={firstName}
        reportPath={reportPath}
        claimed={summary?.summary?.goal_ids}
      />
      <About project={project} />
    </>
  )
}

function Facts({ project }: { project: Project }) {
  return (
    <dl className={styles.facts}>
      <div className={styles.fact}>
        <dt>Företag</dt>
        <dd className={`${styles.factValue} ${styles.companyValue}`}>
          {project.workplace && (
            <CompanyLogo name={project.workplace.name} logoUrl={project.workplace_logo_url} size="sm" />
          )}
          {project.workplace?.name ?? 'Inget företag'}
        </dd>
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

function ReportsSection({
  project,
  studentId,
  reportPath,
}: {
  project: Project
  studentId?: string
  reportPath: (id: string) => string
}) {
  const [shown, setShown] = useState(PAGE)
  const reports = useProjectReports(project.id, studentId)
  const rows = reports.data ?? []

  return (
    <section className={styles.main} aria-labelledby="reports-title">
      <h2 id="reports-title" className="sr-only">
        Redovisningar i projektet
      </h2>

      {reports.isPending && <p className={styles.muted}>Hämtar redovisningar…</p>}
      {reports.isError && <p className={styles.muted}>Redovisningarna gick inte att hämta.</p>}
      {reports.isSuccess && rows.length === 0 && (
        <p className={styles.emptyBox}>Inga redovisningar i projektet än. De dyker upp här när eleverna skickar in.</p>
      )}
      {rows.slice(0, shown).map((report) => (
        <ReportCard key={report.id} report={report} href={reportPath(report.id)} />
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

function ReportCard({ report, href }: { report: ProjectReport; href: string }) {
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
        <ButtonLink to={href} variant="soft">
          Öppna
        </ButtonLink>
      </div>
    </article>
  )
}
