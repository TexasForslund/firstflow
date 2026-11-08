import { Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { useGoals, useGoalsForStudents, type Goal } from '../../api/goals'
import { useWorkplaces } from '../../api/placements'
import { useDeleteProject, useProjects, useSaveProject, type Project, type ProjectWrite } from '../../api/projects'
import { useStudents } from '../../api/students'
import { Avatar, Button, HelpPopover, matches, SelectField, Switch, TextField } from '../../components'
import { suggestGoals } from './goalSuggestions'
import styles from './ProjectDialog.module.css'

const SHOWN_SUGGESTIONS = 3

const DEFAULT_TAGS = ['Elinstallation', 'Mätning', 'Dokumentation', 'Felsökning', 'Kundkontakt']

/**
 * Popupen för nytt projekt och för att ändra ett projekt. Täcker nästan hela skärmen.
 *
 * Läraren som äger projektet ändrar allt: text, företag, handledare och elever. En inbjuden
 * handledare ändrar namn, beskrivning och slutdatum och ser målen, men ändrar inte vilka elever som är med
 * (Texas, 2026-10-29).
 *
 * Målen är skolans (`tags`) och klassens mål från läroplanen (`goal_ids`). Firstflow föreslår
 * klassens mål utifrån orden i beskrivningen (idé 13, steg 4, Texas 2026-11-08).
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
  // Skolans mål (idé 10). Handledaren ser inte skolans lista och får förslag från projekten.
  const goals = useGoals(isOwner)

  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [deadline, setDeadline] = useState(project?.deadline ?? '')
  const [tags, setTags] = useState<string[]>(project?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [goalIds, setGoalIds] = useState<string[]>((project?.class_goals ?? []).map((g) => g.id))
  const [showAllGoals, setShowAllGoals] = useState(false)
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

  // Klassens mål för klasserna som eleverna går i.
  const classGoals = useGoalsForStudents(studentIds, isOwner)
  const knownGoals = useMemo(() => {
    const all = new Map<string, Goal>((project?.class_goals ?? []).map((g) => [g.id, g]))
    for (const g of classGoals.data ?? []) all.set(g.id, g)
    return all
  }, [project, classGoals.data])
  const chosenGoals = goalIds.flatMap((id) => {
    const goal = knownGoals.get(id)
    return goal ? [goal] : []
  })
  const goalSuggestions = useMemo(
    () => suggestGoals(description, classGoals.data ?? [], new Set(goalIds)),
    [description, classGoals.data, goalIds],
  )
  const otherGoals = (classGoals.data ?? []).filter((g) => !goalIds.includes(g.id))

  function addGoal(id: string) {
    if (!goalIds.includes(id) && goalIds.length < 20) setGoalIds([...goalIds, id])
  }

  const suggestions = useMemo(() => {
    const used = new Set(tags.map((t) => t.toLowerCase()))
    const all = [
      ...(goals.data ?? []).map((g) => g.name),
      ...(allProjects.data ?? []).flatMap((p) => p.tags),
      ...DEFAULT_TAGS,
    ]
    const unique = [...new Map(all.map((t) => [t.toLowerCase(), t])).values()]
    return unique.filter((t) => !used.has(t.toLowerCase())).slice(0, 5)
  }, [goals.data, allProjects.data, tags])

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
          // Mål från en klass som ingen av eleverna går i längre följer inte med.
          goal_ids: classGoals.data ? goalIds.filter((id) => classGoals.data.some((g) => g.id === id)) : goalIds,
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
              <span className={styles.labelRow}>
                <span className={styles.label} id="tags-label">
                  Mål
                </span>
                <HelpPopover topic="goals" />
              </span>
              {isOwner ? (
                <>
                  <div className={styles.tagBox}>
                    {chosenGoals.map((goal) => (
                      <span key={goal.id} className={styles.tag}>
                        <span className={styles.goalChip}>
                          {goal.name}
                          <span className={styles.goalGroup}>{goal.group}</span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Ta bort ${goal.name}`}
                          onClick={() => setGoalIds(goalIds.filter((id) => id !== goal.id))}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </span>
                    ))}
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
                      placeholder={tags.length || goalIds.length ? '' : 'Skriv ett eget mål och tryck Enter'}
                      maxLength={40}
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={onTagKey}
                      onBlur={() => tagDraft && addTag(tagDraft)}
                    />
                  </div>
                  <span className={styles.hint}>
                    Vad eleverna ska visa i projektet. Välj klassens mål från läroplanen nedan, eller skriv ett eget,
                    t.ex. Kundkontakt. Målen syns i tabellen Mål i projektet.
                  </span>
                  {(classGoals.data ?? []).length > 0 && (
                    <section className={styles.curriculum} aria-labelledby="curriculum-goals-title">
                      <div>
                        <h3 id="curriculum-goals-title" className={styles.curriculumTitle}>
                          Förslag från läroplanen
                        </h3>
                        <p className={styles.hint}>
                          {goalSuggestions.length > 0
                            ? 'Klassens mål som passar orden i beskrivningen. Du väljer.'
                            : 'Skriv en beskrivning, så föreslår Firstflow klassens mål som passar.'}
                        </p>
                      </div>
                      <ul className={styles.goalList}>
                        {(showAllGoals
                          ? otherGoals.map((goal) => ({ goal, word: null as string | null }))
                          : goalSuggestions.slice(0, SHOWN_SUGGESTIONS)
                        ).map(({ goal, word }) => (
                          <li key={goal.id} className={styles.goalRow}>
                            <span className={styles.goalText}>
                              <span>
                                <span className={styles.optionName}>{goal.name}</span>
                                <span className={styles.goalGroupInline}> · {goal.group}</span>
                              </span>
                              <span className={styles.hint}>
                                {word ? `Beskrivningen nämner ${word}` : goal.curriculum}
                              </span>
                            </span>
                            <button type="button" className={styles.suggestion} onClick={() => addGoal(goal.id)}>
                              + Lägg till
                            </button>
                          </li>
                        ))}
                      </ul>
                      {otherGoals.length > 0 && (
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => setShowAllGoals(!showAllGoals)}
                        >
                          {showAllGoals ? 'Visa bara förslagen' : `Visa alla klassens mål (${otherGoals.length})`}
                        </button>
                      )}
                    </section>
                  )}
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
                </>
              ) : (
                <>
                  <div className={styles.tagList} aria-labelledby="tags-label">
                    {tags.length === 0 && chosenGoals.length === 0 ? (
                      <span className={styles.readonly}>Inga mål</span>
                    ) : (
                      [...chosenGoals.map((g) => g.name), ...tags].map((tag) => (
                        <span key={tag} className={styles.tagReadonly}>
                          {tag}
                        </span>
                      ))
                    )}
                  </div>
                  <span className={styles.hint}>Läraren väljer projektets mål.</span>
                </>
              )}
            </div>

            {isOwner && workplaceId && (
              <fieldset className={styles.supervisors}>
                <legend className={styles.label}>Handledare som kan ändra projektet</legend>
                <p className={styles.hint}>
                  De ändrar text och slutdatum, ser målen och ser redovisningarna. De ändrar inte vilka elever som är
                  med.
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
                <HelpPopover topic="projectCompleted" />
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
