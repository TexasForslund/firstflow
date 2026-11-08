import { useId, useState } from 'react'

import type { Question } from '../../../api/forms'
import type { Track } from '../../../api/tracks'
import { HelpPopover } from '../../../components'
import styles from './FormBuilder.module.css'

/** Visas för: alla elever eller vissa inriktningar (Texas, 2026-10-30). */
export function AudienceEditor({
  question,
  tracks,
  onChange,
}: {
  question: Question
  tracks: Track[]
  onChange: (question: Question) => void
}) {
  const name = useId()
  // Vissa inriktningar är valt även innan läraren har kryssat i någon.
  const [some, setSome] = useState(question.tracks.length > 0)
  const selected = question.tracks
  const isSome = some || selected.length > 0
  const reached = tracks.filter((t) => selected.includes(t.id)).reduce((n, t) => n + t.student_ids.length, 0)

  function toggle(id: string) {
    onChange({ ...question, tracks: selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id] })
  }

  return (
    <section className={styles.settingsSection}>
      <fieldset className={styles.audience}>
        <legend className={styles.settingsTitle}>
          Visas för <HelpPopover topic="tracks" />
        </legend>
        <label className={styles.audienceOption}>
          <input
            type="radio"
            name={name}
            checked={!isSome}
            onChange={() => {
              setSome(false)
              onChange({ ...question, tracks: [] })
            }}
          />
          Alla elever
        </label>
        <label className={styles.audienceOption}>
          <input type="radio" name={name} checked={isSome} onChange={() => setSome(true)} />
          Vissa inriktningar
        </label>
        {isSome && (
          <div className={styles.audienceTracks}>
            {tracks.map((t) => (
              <label key={t.id} className={styles.audienceOption}>
                <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        )}
        <p className={styles.settingsHint}>
          {!isSome
            ? 'Alla elever i klassen får frågan.'
            : selected.length === 0
              ? 'Välj en eller flera inriktningar. Utan val får alla elever frågan.'
              : `Andra elever hoppar över frågan. ${reached} ${reached === 1 ? 'elev' : 'elever'} får den.`}
        </p>
      </fieldset>
    </section>
  )
}
