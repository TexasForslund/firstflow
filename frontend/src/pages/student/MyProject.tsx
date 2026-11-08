import { CalendarDays, Check, ChevronLeft, ChevronRight, FolderKanban, MapPin, User } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { mySummaryImageUrl } from '../../api/projectSummaries'
import { useMyProject, type MyProject as Project } from '../../api/projects'
import { reportImageUrl } from '../../api/reportImages'
import { Avatar, ButtonLink, Card, StarRating } from '../../components'
import { NotFound } from '../NotFound'
import { projectTone } from '../projects/projectText'
import { longDate } from '../reports/answers'
import { Gallery } from '../reports/ImageGallery'
import styles from './MyProject.module.css'

type Tab = 'overview' | 'reports' | 'images' | 'comments'
const TABS: [Tab, string][] = [
  ['overview', 'Översikt'],
  ['reports', 'Redovisningar'],
  ['images', 'Bilder'],
  ['comments', 'Kommentarer'],
]

function shortDay(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Elevens projekt (F21) enligt skiss B, "Firstflow – Elevens projekt skiss" (Texas, 2026-10-29):
 * en färgad topp. Mobilen först.
 *
 * Flikarna Översikt, Redovisningar, Bilder och Kommentarer (idé 12:6 steg 3, Texas skiss
 * "Sammanfattning av projekt" 7 och 8, 2026-11-08). Eleven ser bara sitt eget och kan inte ändra
 * något här, utom sin sammanfattning.
 */
export function MyProject() {
  const { projectId = '' } = useParams()
  const query = useMyProject(projectId)
  const [tab, setTab] = useState<Tab>('overview')

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
        {TABS.map(([value, label]) => (
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
        {tab === 'overview' && <Overview project={project} />}
        {tab === 'reports' && <Reports project={project} />}
        {tab === 'images' && <Images project={project} />}
        {tab === 'comments' && <Comments project={project} />}
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

/** Sammanfattningen, målen och fakta om projektet. */
function Overview({ project }: { project: Project }) {
  const summaryPath = `/my-projects/${project.id}/summary`
  const summary = project.summary
  const people = [
    { id: project.owner.id, name: project.owner.name, role: 'Lärare' },
    ...project.supervisors.map((s) => ({ id: s.id, name: s.name, role: 'Handledare' })),
  ]
  return (
    <div className={styles.overview}>
      {project.completed_at &&
        (summary ? (
          <Card className={styles.card} aria-labelledby="summary-heading">
            <div className={styles.cardHead}>
              <h2 id="summary-heading" className={styles.sectionTitle}>
                Din sammanfattning
              </h2>
              <Link to={summaryPath} className={styles.edit}>
                Ändra
              </Link>
            </div>
            <StarRating value={summary.rating} label="Hur det gick" />
            <p className={styles.best}>”{summary.best}”</p>
            {summary.image_ids.length > 0 && (
              <Gallery images={summary.image_ids.map((id) => ({ id, src: mySummaryImageUrl(project.id, id) }))} />
            )}
          </Card>
        ) : (
          <Card className={styles.card} aria-labelledby="summary-heading">
            <h2 id="summary-heading" className={styles.sectionTitle}>
              Projektet är klart!
            </h2>
            <p className={styles.meta}>Berätta hur det gick. Det tar en minut.</p>
            <ButtonLink to={summaryPath}>Sammanfatta projektet</ButtonLink>
          </Card>
        ))}

      {project.goals.length > 0 && (
        <Card className={styles.card} aria-labelledby="goals-heading">
          <h2 id="goals-heading" className={styles.sectionTitle}>
            Mål i projektet
          </h2>
          <ul className={styles.list}>
            {project.goals.map(({ goal, count, shown }) => (
              <li key={goal.id} className={styles.goal}>
                <span className={styles.rowText}>
                  <span className={styles.goalName}>{goal.name}</span>
                  <span className={styles.meta}>
                    {[goal.group, plural(count, 'redovisning', 'redovisningar')].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {shown && (
                  <span className={styles.shown}>
                    <Check aria-hidden="true" /> Du: visade det
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className={styles.card} aria-labelledby="about-heading">
        <h2 id="about-heading" className={styles.sectionTitle}>
          Om projektet
        </h2>
        <ul className={styles.factList}>
          {project.deadline && (
            <li>
              <CalendarDays aria-hidden="true" /> Klart senast {shortDay(project.deadline)}
            </li>
          )}
          {project.workplace && (
            <li>
              <MapPin aria-hidden="true" /> {project.workplace.name}
            </li>
          )}
          {people.map((p) => (
            <li key={`${p.role}-${p.id}`}>
              <User aria-hidden="true" /> {p.role}: {p.name}
            </li>
          ))}
        </ul>
        <p className={styles.description}>{project.description || 'Läraren har inte skrivit någon beskrivning än.'}</p>
      </Card>
    </div>
  )
}

/** Elevens egna bilder från redovisningarna och sammanfattningen. */
function Images({ project }: { project: Project }) {
  if (project.images.length === 0) {
    return <p className={styles.empty}>Inga bilder än. Bilderna du lägger till i dina redovisningar visas här.</p>
  }
  return (
    <section aria-label="Bilder" className={styles.overview}>
      <p className={styles.meta}>Dina bilder från redovisningar och sammanfattningen. Tryck för att se större.</p>
      <Gallery
        large
        images={project.images.map((image) => ({
          id: image.image_id,
          src: image.report_id
            ? reportImageUrl(image.report_id, image.image_id)
            : mySummaryImageUrl(project.id, image.image_id),
          caption: image.report_id ? (
            <>
              {longDate(image.day)} · <Link to={`/my-reports/${image.report_id}`}>Öppna redovisningen</Link>
            </>
          ) : (
            'Från din sammanfattning'
          ),
        }))}
      />
    </section>
  )
}

/** Det läraren och handledaren har skrivit om eleven och valt att visa. */
function Comments({ project }: { project: Project }) {
  if (project.comments.length === 0) {
    return <p className={styles.empty}>Inga kommentarer än. Här visas det läraren och handledaren skriver om dig.</p>
  }
  return (
    <section aria-label="Kommentarer" className={styles.overview}>
      <p className={styles.meta}>Det läraren och handledaren har skrivit om dig i projektet.</p>
      {project.comments.map((c) => (
        <Card key={c.id} className={styles.card}>
          <div className={styles.commentHead}>
            <Avatar name={c.author.name} size="sm" />
            <span className={styles.rowText}>
              <span className={styles.goalName}>{c.author.name}</span>
              <span className={styles.meta}>
                {c.author_role === 'supervisor' ? 'Handledare' : 'Lärare'} · {shortDay(c.created_at.slice(0, 10))}
              </span>
            </span>
          </div>
          <p className={styles.description}>{c.body}</p>
        </Card>
      ))}
      <p className={styles.meta}>Vill du fråga något? Skriv i Meddelanden.</p>
    </section>
  )
}
