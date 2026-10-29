import { FolderKanban, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { useProjects, type Project } from '../../api/projects'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, matches, SearchInput } from '../../components'
import { ProjectDialog } from './ProjectDialog'
import styles from './Projects.module.css'
import { progress, projectTone, shortDate } from './projectText'

type Show = 'ongoing' | 'done' | 'all'

/**
 * Projekt (B12). En tabell med lärarens projekt, eller projekten handledaren är inbjuden till.
 * Raden leder till projektets sida. Nytt projekt skapas i en popup (Texas, 2026-10-29).
 */
export function Projects() {
  const { data: user } = useCurrentUser()
  const isTeacher = user?.role === 'teacher'
  const query = useProjects()
  const [search, setSearch] = useState('')
  const [show, setShow] = useState<Show>('ongoing')
  const [creating, setCreating] = useState(false)

  const projects = useMemo(() => query.data ?? [], [query.data])
  const ongoing = projects.filter((p) => !p.completed_at)
  const done = projects.filter((p) => p.completed_at)
  const visible = (show === 'ongoing' ? ongoing : show === 'done' ? done : projects).filter(
    (p) =>
      matches(p.name, search) ||
      p.students.some((s) => matches(s.name, search)) ||
      p.tags.some((t) => matches(t, search)) ||
      (p.workplace != null && matches(p.workplace.name, search)),
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Projekt</h1>
          <p className={styles.subtitle}>
            {isTeacher
              ? 'Gemensamma projekt för lärare, handledare och elever.'
              : 'Projekt som du är inbjuden till. Du kan ändra text, slutdatum och taggar.'}
          </p>
        </div>
        {isTeacher && (
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setCreating(true)}>
            Nytt projekt
          </Button>
        )}
      </header>

      <div className={styles.filters}>
        <div className={styles.search}>
          <SearchInput
            label="Sök projekt eller elev"
            placeholder="Sök projekt eller elev"
            value={search}
            onChange={setSearch}
          />
        </div>
        <div role="group" aria-label="Visa" className={styles.segments}>
          {(
            [
              ['ongoing', 'Pågående', ongoing.length],
              ['done', 'Avslutade', done.length],
              ['all', 'Alla', null],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              className={styles.segment}
              aria-pressed={show === value}
              onClick={() => setShow(value)}
            >
              {label}
              {count !== null && <span className={styles.segmentCount}>{count}</span>}
            </button>
          ))}
        </div>
      </div>

      {query.isPending && <p className={styles.state}>Laddar projekt…</p>}
      {query.isError && <p className={styles.state}>Projekten gick inte att hämta. Ladda om sidan.</p>}
      {query.isSuccess && projects.length === 0 && (
        <p className={styles.emptyBox}>
          {isTeacher
            ? 'Du har inga projekt än. Skapa ett och koppla eleverna som arbetar med det.'
            : 'Du är inte inbjuden till något projekt än. Läraren bjuder in dig.'}
        </p>
      )}
      {query.isSuccess && projects.length > 0 && visible.length === 0 && (
        <p className={styles.emptyBox}>Inga projekt matchar.</p>
      )}

      {visible.length > 0 && (
        <div className={styles.table} role="table" aria-label="Projekt">
          <div className={styles.headRow} role="row">
            <span role="columnheader">Projekt</span>
            <span role="columnheader">Elever</span>
            <span role="columnheader">Företag</span>
            <span role="columnheader">Tidplan</span>
            <span role="columnheader" className={styles.right}>
              Redov.
            </span>
          </div>
          {visible.map((project) => (
            <ProjectRow key={project.id} project={project} showUnread={isTeacher} />
          ))}
        </div>
      )}

      {creating && <ProjectDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

function ProjectRow({ project, showUnread }: { project: Project; showUnread: boolean }) {
  const share = progress(project)
  const shown = project.students.slice(0, 4)
  const rest = project.students.length - shown.length

  return (
    <Link to={`/projects/${project.id}`} className={styles.row} role="row">
      <span className={styles.nameCell} role="cell">
        <span className={styles.icon} data-tone={projectTone(project.id)}>
          <FolderKanban aria-hidden="true" />
        </span>
        <span className={styles.nameText}>
          <span className={styles.name}>{project.name}</span>
          {project.tags.length > 0 && (
            <span className={styles.tags}>
              {project.tags.slice(0, 3).map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </span>
          )}
        </span>
      </span>

      <span role="cell" className={styles.avatars}>
        {project.students.length === 0 ? (
          <span className={styles.muted}>Inga elever</span>
        ) : (
          <>
            <span className="sr-only">{project.students.map((s) => s.name).join(', ')}</span>
            {shown.map((s) => (
              <span key={s.id} className={styles.stacked} aria-hidden="true">
                <Avatar name={s.name} size="sm" />
              </span>
            ))}
            {rest > 0 && (
              <span className={styles.more} aria-hidden="true">
                +{rest}
              </span>
            )}
          </>
        )}
      </span>

      <span role="cell" className={styles.company}>
        {project.workplace ? (
          <>
            {project.workplace.name}
            {project.supervisors.length > 0 && (
              <span className={styles.muted}>{project.supervisors.map((s) => s.name).join(', ')}</span>
            )}
          </>
        ) : (
          <span className={styles.muted}>Inget företag kopplat</span>
        )}
      </span>

      <span role="cell" className={styles.timeline}>
        <span>
          {project.completed_at
            ? `Avslutat ${shortDate(project.completed_at.slice(0, 10))}`
            : project.deadline
              ? `Klart ${shortDate(project.deadline)}`
              : 'Inget slutdatum'}
        </span>
        {share !== null && (
          <span className={styles.track} aria-hidden="true">
            <span
              className={styles.bar}
              style={{ width: `${share}%` }}
              data-done={project.completed_at ? '' : undefined}
            />
          </span>
        )}
      </span>

      <span role="cell" className={`${styles.right} ${styles.count}`}>
        {project.report_count}
        {showUnread && project.report_count > 0 && (
          <span className={project.unread_count > 0 ? styles.unread : styles.allRead}>
            {project.unread_count > 0
              ? `${project.unread_count} ${project.unread_count === 1 ? 'oläst' : 'olästa'}`
              : 'Alla lästa'}
          </span>
        )}
      </span>
    </Link>
  )
}
