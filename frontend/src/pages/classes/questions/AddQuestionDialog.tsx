import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { QuestionType } from '../../../api/forms'
import styles from './FormBuilder.module.css'
import { QUESTION_TYPES, TYPE_GROUPS } from './questionTypes'
import { TypeBadge } from './TypeBadge'

/** Menyn med frågetyper, grupperad och färgkodad som "Add form elements" i Typeform. */
export function AddQuestionDialog({ onPick, onClose }: { onPick: (type: QuestionType) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    // Ingen close() vid avmontering: rutan försvinner med komponenten, och ett close-event
    // skulle annars stänga den direkt igen i React StrictMode.
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="add-question-title"
      onClose={onClose}
      onClick={(e) => {
        // Klick utanför rutan stänger menyn.
        if (e.target === ref.current) onClose()
      }}
    >
      <div className={styles.dialogInner}>
        <div className={styles.dialogHeader}>
          <h2 id="add-question-title" className={styles.dialogTitle}>
            Lägg till fråga
          </h2>
          <button type="button" className={styles.iconButton} aria-label="Stäng" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={styles.typeGroups}>
          {TYPE_GROUPS.map((group) => (
            <section key={group.id} className={styles.typeGroup} aria-labelledby={`group-${group.id}`}>
              <h3 id={`group-${group.id}`} className={styles.typeGroupTitle}>
                {group.label}
              </h3>
              <ul className={styles.typeList}>
                {group.types.map((type) => (
                  <li key={type}>
                    <button type="button" className={styles.typeButton} onClick={() => onPick(type)}>
                      <TypeBadge type={type} />
                      <span className={styles.typeText}>
                        <span className={styles.typeLabel}>{QUESTION_TYPES[type].label}</span>
                        <span className={styles.typeDescription}>{QUESTION_TYPES[type].description}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </dialog>
  )
}
