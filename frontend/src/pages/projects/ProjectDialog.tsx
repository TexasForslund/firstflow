import { Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { useWorkplaces } from '../../api/placements'
import { useDeleteProject, useProjects, useSaveProject, type Project, type ProjectWrite } from '../../api/projects'
import { useStudents } from '../../api/students'
import { Avatar, Button, matches, SelectField, Switch, TextField } from '../../components'
import styles from './ProjectDialog.module.css'

const DEFAULT_TAGS = ['Elinstallation', 'Mätning', 'Dokumentation', 'Felsökning', 'Kundkontakt']

/**
 * Popupen för nytt projekt och för att ändra ett projekt. Täcker nästan hela skärmen.
 *
 * Läraren som äger projektet ändrar allt: text, företag, handledare och elever. En inbjuden
 * handledare ändrar namn, beskrivning, slutdatum och taggar, men inte vilka elever som är med
 * (Texas, 2026-10-29).
 */
export function ProjectDialog({
  project,
  onClose,
  onDeleted,
}: {
  project?: Project
  onClose: () => void
  onDeleted?: () => void
}) {
  const isOwner = !project || project.can_edit_students
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    // Ingen close() vid avmontering, se AddQuestionDialog.
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const save = useSaveProject(project?.id)
  const remove = useDeleteProject()
  const students = useStudents(isOwner)
  const workplaces = useWorkplaces(isOwner)
  const allProjects = useProjects()

  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [deadline, setDeadline] = useState(project?.deadline ?? '')
  const [tags, setTags] = useState<string[]>(project?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [workplaceId, setWorkplaceId] = useState(project?.workplace?.id ?? '')
  const [supervisorIds, setSupervisorIds] = useState<string[]>(project?.supervisors.map((s) => s.id) ?? [])
  const [studentIds, setStudentIds] = useState<string[]>(project?.students.map((s) => s.id) ?? [])
  const [completed, setCompleted] = useState(Boolean(project?.completed_at))
  const [studentSearch, setStudentSearch] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const workplace = workplaces.data?.find((w) => w.id === workplaceId)
  const studentOptions = students.data ?? []
  const chosen = studentOptions.filter((s) => studentIds.includes(s.id))
  // Elever som är med men som läraren inte längre ser i sin lista visas ändå som valda.
  const chosenElsewhere = (project?.students ?? []).filter(
    (s) => studentIds.includes(s.id) && !studentOptions.some((o) => o.id === s.id),
  )

  const suggestions = useMemo(() => {
    const used = new Set(tags.map((t) => t.toLowerCase()))
    const all = [...(allProjects.data ?? []).flatMap((p) => p.tags), ...DEFAULT_TAGS]
    const unique = [...new Map(all.map((t) => [t.toLowerCase(), t])).values()]
    return unique.filter((t) => !used.has(t.toLowerCase())).slice(0, 5)
  }, [allProjects.data, tags])

  function addTag(raw: string) {
    const tag = raw.trim().slice(0, 40)
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase()) && tags.length < 10) {
      setTags([...tags, tag])
    }
    setTagDraft('')
  }

  function onTagKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addTag(tagDraft)
    } else if (event.key === 'Backspace' && !tagDraft && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  function chooseWorkplace(id: string) {
    setWorkplaceId(id)
    // Handledare måste höra till projektets företag.
    const next = workplaces.data?.find((w) => w.id === id)
    setSupervisorIds((ids) => ids.filter((sid) => next?.supervisors.some((s) => s.id === sid)))
  }

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const allTags = tagDraft.trim() ? [...tags, tagDraft.trim()] : tags
    const text: ProjectWrite = {
      name,
      description: description || null,
      deadline: deadline || null,
      tags: allTags,
      clear_workplace: false,
    }
    const body: ProjectWrite = isOwner
      ? {
          ...text,
          student_ids: studentIds,
          workplace_id: workplaceId || null,
          clear_workplace: !workplaceId,
          supervisor_ids: workplaceId ? supervisorIds : [],
          completed: project ? completed : null,
        }
      : text
    save.mutate(body, { onSuccess: onClose })
  }

  const title = project ? 'Ändra projekt' : 'Nytt projekt'

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="project-dialog-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <form className={styles.frame} onSubmit={submit}>
        <header className={styles.header}>
          <h1 id="project-dialog-title" className={styles.title}>
            {title}
          </h1>
          <button type="button" className={styles.close} aria-label="Stäng" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body} data-owner={isOwner ? '' : undefined}>
          <div className={styles.left}>
            <TextField label="Namn" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            <label className={styles.field}>
              <span className={styles.label}>Beskrivning</span>
              <textarea
                className={styles.textarea}
                rows={5}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className={styles.pair}>
              <TextField
                label="Klart senast (valfritt)"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              {isOwner ? (
                <SelectField label="Företag" value={workplaceId} onChange={chooseWorkplace}>
                  <option value="">Inget företag</option>
                  {(workplaces.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <div className={styles.field}>
                  <span className={styles.label}>Företag</span>
                  <span className={styles.readonly}>{project?.workplace?.name ?? 'Inget företag'}</span>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <span className={styles.label} id="tags-label">
                Taggar
              </span>
              <div className={styles.tagBox}>
                {tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                    <button
                      type="button"
                      aria-label={`Ta bort ${tag}`}
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <input
                  className={styles.tagInput}
                  aria-labelledby="tags-label"
                  placeholder={tags.length ? '' : 'Skriv och tryck Enter'}
                  maxLength={40}
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={onTagKey}
                  onBlur={() => tagDraft && addTag(tagDraft)}
                />
              </div>
              {suggestions.length > 0 && (
                <span className={styles.suggestions}>
                  Förslag:
                  {suggestions.map((tag) => (
                    <button key={tag} type="button" className={styles.suggestion} onClick={() => addTag(tag)}>
                      {tag}
                    </button>
                  ))}
                </span>
              )}
            </div>

            {isOwner && workplaceId && (
              <fieldset className={styles.supervisors}>
                <legend className={styles.label}>Handledare som kan ändra projektet</legend>
                <p className={styles.hint}>
                  De ändrar text, slutdatum och taggar och ser redovisningarna. De ändrar inte vilka elever som är med.
                </p>
                {(workplace?.supervisors ?? []).length === 0 && (
                  <p className={styles.hint}>Företaget har inga handledare än. Bjud in dem under Praktikplatser.</p>
                )}
                {(workplace?.supervisors ?? []).map((s) => (
                  <label key={s.id} className={styles.option}>
                    <input
                      type="checkbox"
                      checked={supervisorIds.includes(s.id)}
                      onChange={() => setSupervisorIds(toggle(supervisorIds, s.id))}
                    />
                    <Avatar name={s.name} size="sm" />
                    <span className={styles.optionText}>
                      <span className={styles.optionName}>{s.name}</span>
                      <span className={styles.optionMeta}>{s.email}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {isOwner && project && (
              <div className={styles.switch}>
                <Switch
                  label="Projektet är avslutat"
                  description="Avslutade projekt visas under Avslutade i listan."
                  checked={completed}
                  onChange={setCompleted}
                />
              </div>
            )}

            {!isOwner && (
              <p className={styles.hint}>
                Läraren väljer vilka elever som är med och vilket företag projektet görs på.
              </p>
            )}
          </div>

          {isOwner && (
            <div className={styles.right}>
              <div className={styles.rightHead}>
                <h2 className={styles.sectionTitle}>Elever i projektet</h2>
                <span className={styles.count}>{studentIds.length} valda</span>
              </div>
              {(chosen.length > 0 || chosenElsewhere.length > 0) && (
                <ul className={styles.chips} aria-label="Valda elever">
                  {[...chosen, ...chosenElsewhere].map((s) => (
                    <li key={s.id} className={styles.chip}>
                      <Avatar name={s.name} size="sm" />
                      {s.name}
                      <button
                        type="button"
                        aria-label={`Ta bort ${s.name}`}
                        onClick={() => setStudentIds(studentIds.filter((id) => id !== s.id))}
                      >
                        <X aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className={styles.searchBox}>
                <Search aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Sök elev"
                  placeholder="Sök elev"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
              </label>
              <div className={styles.options}>
                {students.isPending && <p className={styles.hint}>Hämtar elever…</p>}
                {students.isSuccess && studentOptions.length === 0 && (
                  <p className={styles.hint}>Du har inga elever än.</p>
                )}
                {studentOptions
                  .filter((s) => matches(s.name, studentSearch))
                  .map((s) => (
                    <label key={s.id} className={styles.option}>
                      <input
                        type="checkbox"
                        checked={studentIds.includes(s.id)}
                        onChange={() => setStudentIds(toggle(studentIds, s.id))}
                      />
                      <Avatar name={s.name} size="sm" />
                      <span className={styles.optionText}>
                        <span className={styles.optionName}>{s.name}</span>
                        <span className={styles.optionMeta}>
                          {[s.classes.map((c) => c.name).join(', '), s.workplace?.name].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          {isOwner && project && !confirmingDelete && (
            <button type="button" className={styles.delete} onClick={() => setConfirmingDelete(true)}>
              <Trash2 aria-hidden="true" /> Ta bort projektet
            </button>
          )}
          {confirmingDelete && project && (
            <span className={styles.confirm}>
              Ta bort projektet? Redovisningarna finns kvar.
              <button
                type="button"
                className={styles.delete}
                disabled={remove.isPending}
                onClick={() => remove.mutate(project.id, { onSuccess: onDeleted ?? onClose })}
              >
                Ja, ta bort
              </button>
              <button type="button" className={styles.textButton} onClick={() => setConfirmingDelete(false)}>
                Avbryt
              </button>
            </span>
          )}
          <span className={styles.spacer} />
          {save.isError && (
            <span className={styles.error} role="alert">
              {save.error.message}
            </span>
          )}
          <Button onClick={onClose}>Avbryt</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {project ? 'Spara' : 'Skapa projekt'}
          </Button>
        </footer>
      </form>
    </dialog>
  )
}
