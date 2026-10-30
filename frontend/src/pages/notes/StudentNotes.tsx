import { Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import {
  noteTagLabel,
  useCreateNote,
  useDeleteNote,
  useUpdateNote,
  type NoteTag,
  type StudentNote,
} from '../../api/notes'
import styles from './StudentNotes.module.css'

const TAGS: NoteTag[] = ['praise', 'concern', 'other']

function noteDate(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

export function NoteTagBadge({ tag }: { tag: NoteTag }) {
  return (
    <span className={styles.tag} data-tag={tag}>
      {noteTagLabel[tag]}
    </span>
  )
}

/** En anteckning. Handledaren kan ändra och ta bort sina egna i 24 timmar (Texas, 2026-10-30). */
export function NoteItem({ note, studentId, showRole }: { note: StudentNote; studentId: string; showRole?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const remove = useDeleteNote(studentId, note.id)

  if (editing) {
    return <NoteForm studentId={studentId} note={note} onDone={() => setEditing(false)} />
  }
  return (
    <article className={styles.note}>
      <p className={styles.meta}>
        <NoteTagBadge tag={note.tag} />
        <strong>{note.author.name}</strong>
        <span className={styles.muted}>
          {showRole ? 'Handledare · ' : ''}
          {noteDate(note.created_at)}
          {note.updated_at ? ' · ändrad' : ''}
        </span>
      </p>
      <p className={styles.body}>{note.body}</p>
      {note.can_edit && (
        <p className={styles.actions}>
          <button type="button" className={styles.link} onClick={() => setEditing(true)}>
            Ändra
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                className={styles.danger}
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Ja, ta bort
              </button>
              <button type="button" className={styles.link} onClick={() => setConfirmDelete(false)}>
                Avbryt
              </button>
            </>
          ) : (
            <button type="button" className={styles.link} onClick={() => setConfirmDelete(true)}>
              Ta bort
            </button>
          )}
          <span className={styles.muted}>Går att ändra i 24 timmar</span>
        </p>
      )}
      {remove.isError && (
        <p className={styles.error} role="alert">
          {remove.error.message}
        </p>
      )}
    </article>
  )
}

/** Ny anteckning, eller ändra en befintlig när `note` finns. */
export function NoteForm({
  studentId,
  firstName,
  note,
  onDone,
}: {
  studentId: string
  firstName?: string
  note?: StudentNote
  onDone?: () => void
}) {
  const [tag, setTag] = useState<NoteTag | null>(note?.tag ?? null)
  const [body, setBody] = useState(note?.body ?? '')
  const create = useCreateNote(studentId)
  const update = useUpdateNote(studentId, note?.id ?? '')
  const save = note ? update : create
  const fieldId = `note-${note?.id ?? 'new'}`

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!tag || !body.trim()) return
    save.mutate(
      { tag, body },
      {
        onSuccess: () => {
          if (!note) {
            setTag(null)
            setBody('')
          }
          onDone?.()
        },
      },
    )
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.tags} role="group" aria-label="Typ av anteckning">
        {TAGS.map((t) => (
          <button
            key={t}
            type="button"
            className={styles.tagOption}
            data-tag={t}
            aria-pressed={tag === t}
            onClick={() => setTag(t)}
          >
            {noteTagLabel[t]}
          </button>
        ))}
      </div>
      <label htmlFor={fieldId} className="sr-only">
        Anteckning
      </label>
      <textarea
        id={fieldId}
        className={styles.textarea}
        value={body}
        rows={3}
        maxLength={2000}
        placeholder="Skriv vad som hände, sakligt och utan omdömen om personen…"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className={styles.formFoot}>
        <span className={styles.hint}>
          <Lock aria-hidden="true" />
          {firstName ? `${firstName}s lärare ser anteckningen. ${firstName} ser den inte.` : 'Eleven ser den inte.'}
        </span>
        <span className={styles.formButtons}>
          {note && (
            <button type="button" className={styles.link} onClick={onDone}>
              Avbryt
            </button>
          )}
          <button type="submit" className={styles.save} disabled={!tag || !body.trim() || save.isPending}>
            {note ? 'Spara ändring' : 'Spara'}
          </button>
        </span>
      </div>
      {!tag && body.trim() && <p className={styles.muted}>Välj Beröm, Oro eller Övrigt.</p>}
      {save.isError && (
        <p className={styles.error} role="alert">
          {save.error.message}
        </p>
      )}
    </form>
  )
}
