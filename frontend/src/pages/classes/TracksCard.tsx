import { Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import {
  useClassTracks,
  useCreateTrack,
  useDeleteTrack,
  useSetStudentTrack,
  trackOf,
  trackTone,
  type Track,
} from '../../api/tracks'
import { Card } from '../../components'
import styles from './Classes.module.css'
import own from './TracksCard.module.css'

export function TrackPill({ tracks, trackId }: { tracks: Track[]; trackId: string }) {
  const track = tracks.find((t) => t.id === trackId)
  if (!track) return null
  return (
    <span className={own.pill} data-tone={trackTone(tracks, trackId)}>
      {track.name}
    </span>
  )
}

/**
 * Klassens inriktningar (Texas, 2026-10-30), t.ex. Dator och Programmering. Används för att
 * ställa vissa frågor till bara en del av klassen.
 */
export function TracksCard({ classId, canEdit }: { classId: string; canEdit: boolean }) {
  const query = useClassTracks(classId)
  const create = useCreateTrack(classId)
  const remove = useDeleteTrack(classId)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const tracks = query.data ?? []

  if (!canEdit && tracks.length === 0) return null

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    create.mutate(name.trim(), {
      onSuccess: () => {
        setName('')
        setAdding(false)
      },
    })
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Inriktningar</h2>
        <span className={own.lead}>Används för att ställa vissa frågor till bara en del av klassen</span>
      </div>
      <div className={own.body}>
        <ul className={own.tracks}>
          {tracks.map((track) => (
            <li key={track.id} className={own.track} data-tone={trackTone(tracks, track.id)}>
              {track.name}
              <span className={own.trackCount}>{track.student_ids.length}</span>
              {canEdit &&
                (confirm === track.id ? (
                  <>
                    <button
                      type="button"
                      className={own.confirm}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(track.id, { onSuccess: () => setConfirm(null) })}
                    >
                      Ta bort
                    </button>
                    <button type="button" className={own.cancel} onClick={() => setConfirm(null)}>
                      Avbryt
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={own.remove}
                    aria-label={`Ta bort inriktningen ${track.name}`}
                    onClick={() => setConfirm(track.id)}
                  >
                    <X aria-hidden="true" />
                  </button>
                ))}
            </li>
          ))}
          {canEdit && !adding && (
            <li>
              <button type="button" className={own.add} onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" /> Ny inriktning
              </button>
            </li>
          )}
        </ul>
        {tracks.length === 0 && !adding && (
          <p className={own.lead}>Till exempel Dator och Programmering. Sedan väljer du inriktning för varje elev.</p>
        )}
        {adding && (
          <form className={own.form} onSubmit={submit}>
            <label htmlFor={`track-name-${classId}`} className="sr-only">
              Namn på inriktningen
            </label>
            <input
              id={`track-name-${classId}`}
              className={own.input}
              value={name}
              maxLength={50}
              placeholder="T.ex. Programmering"
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className={own.save} disabled={!name.trim() || create.isPending}>
              Lägg till
            </button>
            <button type="button" className={own.cancel} onClick={() => setAdding(false)}>
              Avbryt
            </button>
          </form>
        )}
        {create.isError && (
          <p className={styles.formError} role="alert">
            {create.error.message}
          </p>
        )}
        {confirm && (
          <p className={own.lead}>Eleverna får ingen inriktning, och frågorna i utkastet slutar gälla den.</p>
        )}
      </div>
    </Card>
  )
}

/** Välj elevens inriktning i elevlistan. Visas bara när klassen har inriktningar. */
export function StudentTrackSelect({
  classId,
  studentId,
  studentName,
  canEdit,
}: {
  classId: string
  studentId: string
  studentName: string
  canEdit: boolean
}) {
  const query = useClassTracks(classId)
  const save = useSetStudentTrack(classId)
  const tracks = query.data ?? []
  if (tracks.length === 0) return null
  const current = trackOf(tracks, studentId)
  if (!canEdit) {
    return current ? <TrackPill tracks={tracks} trackId={current.id} /> : null
  }
  return (
    <select
      className={own.select}
      aria-label={`Inriktning för ${studentName}`}
      value={current?.id ?? ''}
      disabled={save.isPending}
      onChange={(e) => save.mutate({ studentId, trackId: e.target.value || null })}
    >
      <option value="">Ingen inriktning</option>
      {tracks.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
