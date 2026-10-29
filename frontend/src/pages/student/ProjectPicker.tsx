import { FolderKanban } from 'lucide-react'

import { useMyProjects } from '../../api/projects'
import { useSetReportProject } from '../../api/reports'
import styles from './ProjectPicker.module.css'

/**
 * "Koppla till projekt (valfritt)" på redovisningens sista steg (Texas, 2026-10-29, förslag B).
 * Inget är förvalt och valet sparas direkt. Ett tryck till på samma projekt tar bort det.
 * Visas inte om eleven inte har något pågående projekt.
 */
export function ProjectPicker({ reportId, projectId }: { reportId: string; projectId: string | null }) {
  const projects = useMyProjects()
  const save = useSetReportProject(reportId)
  const list = projects.data ?? []
  if (list.length === 0) return null

  const chosen = save.isPending ? save.variables : projectId

  return (
    <div className={styles.picker} role="group" aria-labelledby="project-picker-label">
      <span id="project-picker-label" className={styles.label}>
        Koppla till projekt <span className={styles.optional}>(valfritt)</span>
      </span>
      <div className={styles.chips}>
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.chip}
            aria-pressed={chosen === p.id}
            disabled={save.isPending}
            onClick={() => save.mutate(chosen === p.id ? null : p.id)}
          >
            <FolderKanban aria-hidden="true" />
            {p.name}
          </button>
        ))}
      </div>
      {save.isError && (
        <p className={styles.error} role="alert">
          Projektet gick inte att spara. Försök igen.
        </p>
      )}
    </div>
  )
}
