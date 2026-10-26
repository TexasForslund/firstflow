import { CalendarDays, FileText, Folder, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { useDeleteProject, useProjects, useSaveProject, type Project } from '../../api/projects'
import { useStudents } from '../../api/students'
import { Avatar, Button, Card, Tag, TextField } from '../../components'
import styles from '../classes/Classes.module.css'
import { CheckList } from '../students/CheckList'
import own from './Projects.module.css'

function deadlineText(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Projekt (B12). Läraren skapar projekt, kopplar elever och ser hur många redovisningar som hör
 * till projektet. Eleverna leder till elevsidan (Texas, 2026-10-26).
 */
export function Projects() {
  const query = useProjects()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const projects = query.data ?? []

  return (
    <div className={styles.page}>
      <header className={own.header}>
        <div className={styles.header}>
          <h1 className={styles.title}>Projekt</h1>
          <p className={styles.subtitle}>
            Projekt som eleverna arbetar med under APL. Redovisningarna kopplas till ett projekt.
          </p>
        </div>
        {!creating && (
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setCreating(true)}>
            Nytt projekt
          </Button>
        )}
      </header>

      {creating && <ProjectForm onDone={() => setCreating(false)} />}

      {query.isPending && <p className={styles.state}>Laddar projekt…</p>}
      {query.isError && <p className={styles.state}>Projekten gick inte att hämta. Ladda om sidan.</p>}
      {query.isSuccess && projects.length === 0 && !creating && (
        <Card>
          <p className={styles.empty}>Du har inga projekt än. Skapa ett och koppla eleverna som arbetar med det.</p>
        </Card>
      )}

      <div className={own.grid}>
        {projects.map((project) =>
          editing === project.id ? (
            <ProjectForm key={project.id} project={project} onDone={() => setEditing(null)} />
          ) : (
            <ProjectCard key={project.id} project={project} onEdit={() => setEditing(project.id)} />
          ),
        )}
      </div>
    </div>
  )
}

function ProjectCard({ project, onEdit }: { project: Project; onEdit: () => void }) {
  const remove = useDeleteProject()
  const [confirming, setConfirming] = useState(false)

  return (
    <Card>
      <article className={own.card} aria-labelledby={`project-${project.id}`}>
        <div className={own.cardTop}>
          <span className={own.icon}>
            <Folder aria-hidden="true" />
          </span>
          <h2 id={`project-${project.id}`} className={own.name}>
            {project.name}
          </h2>
          {project.is_owner && (
            <button type="button" className={own.iconButton} aria-label={`Ändra ${project.name}`} onClick={onEdit}>
              <Pencil aria-hidden="true" />
            </button>
          )}
        </div>
        {project.description && <p className={own.description}>{project.description}</p>}
        {project.tags.length > 0 && (
          <div className={styles.tags}>
            {project.tags.map((tag) => (
              <Tag key={tag} icon={null}>
                {tag}
              </Tag>
            ))}
          </div>
        )}
        <p className={own.meta}>
          {project.deadline && (
            <span>
              <CalendarDays aria-hidden="true" /> Klart {deadlineText(project.deadline)}
            </span>
          )}
          <span>
            <FileText aria-hidden="true" /> {project.report_count}{' '}
            {project.report_count === 1 ? 'redovisning' : 'redovisningar'}
          </span>
        </p>
        <ul className={own.students} aria-label="Elever i projektet">
          {project.students.length === 0 && <li className={own.noStudents}>Inga elever kopplade än.</li>}
          {project.students.map((student) => (
            <li key={student.id}>
              <Link to={`/students/${student.id}`} className={own.student}>
                <Avatar name={student.name} size="sm" />
                {student.name}
              </Link>
            </li>
          ))}
        </ul>
        {project.is_owner && (
          <div className={own.footer}>
            {confirming ? (
              <>
                <span className={styles.confirmText}>Ta bort projektet? Redovisningarna finns kvar.</span>
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(project.id)}
                >
                  Ta bort
                </button>
                <button type="button" className={styles.textButton} onClick={() => setConfirming(false)}>
                  Avbryt
                </button>
              </>
            ) : (
              <button type="button" className={own.removeLink} onClick={() => setConfirming(true)}>
                <Trash2 aria-hidden="true" /> Ta bort
              </button>
            )}
          </div>
        )}
      </article>
    </Card>
  )
}

function ProjectForm({ project, onDone }: { project?: Project; onDone: () => void }) {
  const save = useSaveProject(project?.id)
  const students = useStudents()
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [deadline, setDeadline] = useState(project?.deadline ?? '')
  const [tags, setTags] = useState((project?.tags ?? []).join(', '))
  const [studentIds, setStudentIds] = useState<string[]>(project?.students.map((s) => s.id) ?? [])

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate(
      {
        name,
        description: description || null,
        deadline: deadline || null,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        student_ids: studentIds,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <Card>
      <form className={own.form} onSubmit={submit}>
        <h2 className={styles.cardTitle}>{project ? 'Ändra projekt' : 'Nytt projekt'}</h2>
        <div className={styles.formGrid}>
          <TextField label="Namn" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Klart senast (valfritt)" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <label className={own.textareaField}>
          <span className={own.label}>Beskrivning</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <TextField
          label="Taggar, med kommatecken emellan"
          placeholder="Elinstallation, Mätning"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <CheckList
          legend="Elever"
          options={(students.data ?? []).map((s) => ({ id: s.id, name: s.name }))}
          selected={studentIds}
          onChange={setStudentIds}
          emptyText={students.isPending ? 'Hämtar elever…' : 'Du har inga elever än.'}
        />
        {save.isError && (
          <p className={styles.formError} role="alert">
            {save.error.message}
          </p>
        )}
        <div className={styles.formActions}>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {project ? 'Spara' : 'Skapa projekt'}
          </Button>
          <Button onClick={onDone}>Avbryt</Button>
        </div>
      </form>
    </Card>
  )
}
