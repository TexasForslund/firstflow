import { ChevronLeft, ChevronRight, FolderKanban } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { useMyProject, type MyProject as Project } from '../../api/projects'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar } from '../../components'
import { NotFound } from '../NotFound'
import { projectTone } from '../projects/projectText'
import { longDate } from '../reports/answers'
import styles from './MyProject.module.css'

type Tab = 'reports' | 'about'

function shortDay(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Elevens projekt (F21) enligt skiss B, "Firstflow – Elevens projekt skiss" (Texas, 2026-10-29):
 * en färgad topp och flikarna Mina redovisningar och Om projektet. Mobilen först.
 */
export function MyProject() {
  const { projectId = '' } = useParams()
  const query = useMyProject(projectId)
  const [tab, setTab] = useState<Tab>('reports')

  if (query.isPending) return <p className={styles.state}>Laddar projektet…</p>
  if (query.isError) return <NotFound what="Projektet" />
  const project = query.data

  return (
    <div className={styles.page}>
      <header className={styles.top} data-tone={projectTone(project.id)}>
        <Link to="/my-apl" className={styles.back}>
          <ChevronLeft aria-hidden="true" /> Min APL
        </Link>
        <span className={styles.icon} aria-hidden="true">
          <FolderKanban />
        </span>
        <h1 className={styles.title}>{project.name}</h1>
        <ul className={styles.facts} aria-label="Om projektet i korthet">
          {project.workplace && <li>{project.workplace.name}</li>}
          {project.deadline && <li>Klart {shortDay(project.deadline)}</li>}
          {project.completed_at && <li>Avslutat</li>}
          <li>{plural(project.reports.length, 'redovisning', 'redovisningar')}</li>
        </ul>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Projektet">
        {(
          [
            ['reports', 'Mina redovisningar'],
            ['about', 'Om projektet'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-controls={`panel-${value}`}
            aria-selected={tab === value}
            className={styles.tab}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.panel}>
        {tab === 'reports' ? <Reports project={project} /> : <About project={project} />}
      </div>
    </div>
  )
}

function Reports({ project }: { project: Project }) {
  if (project.reports.length === 0) {
    return (
      <p className={styles.empty}>
        Inga redovisningar i projektet än. Välj projektet i sista steget när du skickar in en redovisning.
      </p>
    )
  }
  return (
    <ul className={styles.list}>
      {project.reports.map((report) => {
        const day = longDate(report.due_date)
        return (
          <li key={report.id}>
            <Link to={`/my-reports/${report.id}`} className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.meta}>
                  {day.charAt(0).toUpperCase() + day.slice(1)} ·{' '}
                  {report.comment_count === 0
                    ? 'Inga kommentarer'
                    : plural(report.comment_count, 'kommentar', 'kommentarer')}
                </span>
                {report.excerpt && <span className={styles.excerpt}>{report.excerpt.text}</span>}
              </span>
              <ChevronRight aria-hidden="true" className={styles.chevron} />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function About({ project }: { project: Project }) {
  const { data: me } = useCurrentUser()
  // Eleven själv visas inte bland de andra eleverna.
  const people = [
    { id: project.owner.id, name: project.owner.name, role: 'Lärare' },
    ...project.supervisors.map((s) => ({ id: s.id, name: s.name, role: 'Handledare' })),
    ...project.students.filter((s) => s.id !== me?.id).map((s) => ({ id: s.id, name: s.name, role: 'Elev' })),
  ]
  return (
    <div className={styles.about}>
      <section className={styles.section} aria-labelledby="about-heading">
        <h2 id="about-heading" className={styles.sectionTitle}>
          Om projektet
        </h2>
        <p className={styles.description}>{project.description || 'Läraren har inte skrivit någon beskrivning än.'}</p>
        {project.tags.length > 0 && (
          <ul className={styles.tags} aria-label="Mål">
            {project.tags.map((tag) => (
              <li key={tag} className={styles.tag}>
                {tag}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={styles.section} aria-labelledby="people-heading">
        <h2 id="people-heading" className={styles.sectionTitle}>
          Med i projektet
        </h2>
        <ul className={styles.people}>
          {people.map((p) => (
            <li key={`${p.role}-${p.id}`} className={styles.person}>
              <Avatar name={p.name} size="sm" />
              <span className={styles.personName}>{p.name}</span>
              <span className={styles.meta}>{p.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
