import { Check, ChevronDown, FolderKanban } from 'lucide-react'
import { useState } from 'react'

import type { Project } from '../../api/projects'
import { useSetReportProject } from '../../api/reports'
import { projectTone } from '../projects/projectText'
import styles from './ProjectStep.module.css'

/** Så många projekt visas innan "Se fler" (Texas, 2026-10-29). */
const SHOWN = 3

function deadlineText(iso: string) {
  return `klart ${new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
}

/**
 * Redovisningens sista steg: "Hör dagens jobb till ett projekt?" (Texas skiss A, 2026-10-29).
 * Valfritt och inget är förvalt. Valet sparas direkt, och ett tryck till tar bort det.
 */
export function ProjectStep({
  reportId,
  projects,
  projectId,
}: {
  reportId: string
  projects: Project[]
  projectId: string | null
}) {
  const save = useSetReportProject(reportId)
  const chosen = save.isPending ? save.variables : projectId
  const [showAll, setShowAll] = useState(false)
  // Ett valt projekt längre ner i listan visas alltid, så att valet syns.
  const visible = showAll ? projects : projects.filter((p, i) => i < SHOWN || p.id === chosen || p.id === projectId)
  const hidden = projects.length - visible.length

  return (
    <div className={styles.step}>
      <p className={styles.kicker}>Sista steget · valfritt</p>
      <h2 tabIndex={-1} className={styles.title}>
        Hör dagens jobb till ett projekt?
      </h2>
      <p className={styles.intro}>Då hamnar redovisningen i projektet, där din lärare och handledaren följer det.</p>

      <div className={styles.cards} role="group" aria-label="Projekt">
        {visible.map((p) => {
          const selected = chosen === p.id
          return (
            <button
              key={p.id}
              type="button"
              className={styles.card}
              aria-pressed={selected}
              disabled={save.isPending}
              onClick={() => save.mutate(selected ? null : p.id)}
            >
              <span className={styles.icon} data-tone={projectTone(p.id)}>
                <FolderKanban aria-hidden="true" />
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{p.name}</span>
                <span className={styles.meta}>
                  {[p.workplace?.name, p.deadline && deadlineText(p.deadline)].filter(Boolean).join(' · ') ||
                    'Inget slutdatum'}
                </span>
              </span>
              <span className={styles.check} aria-hidden="true">
                {selected && <Check />}
              </span>
            </button>
          )
        })}
      </div>

      {hidden > 0 && (
        <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
          Se fler ({hidden}) <ChevronDown aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        className={styles.none}
        aria-pressed={chosen === null}
        disabled={save.isPending}
        onClick={() => chosen !== null && save.mutate(null)}
      >
        Inget projekt den här gången
      </button>

      {save.isError && (
        <p className={styles.error} role="alert">
          Projektet gick inte att spara. Försök igen.
        </p>
      )}
    </div>
  )
}
