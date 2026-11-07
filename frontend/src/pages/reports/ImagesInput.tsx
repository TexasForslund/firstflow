import { Camera, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import type { Question } from '../../api/forms'
import type { AnswerValue } from '../../api/reports'
import { reportImageUrl, useDeleteReportImage, useUploadReportImage } from '../../api/reportImages'
import styles from './Images.module.css'

type ImagesQuestion = Extract<Question, { type: 'images' }>

/**
 * Eleven tar foton eller väljer bilder (Texas skiss "Fråga med bilder", 2026-11-07). Varje bild
 * görs mindre i mobilen och laddas upp direkt. Svaret, bildernas id:n i ordning, sparas när
 * eleven trycker Nästa, som för andra frågor.
 */
export function ImagesInput({
  question,
  reportId,
  answer,
  onChange,
}: {
  question: ImagesQuestion
  /** Saknas i förhandsgranskningen, där inget laddas upp. */
  reportId?: string
  answer: AnswerValue | undefined
  onChange: (value: AnswerValue) => void
}) {
  const upload = useUploadReportImage(reportId ?? '')
  const remove = useDeleteReportImage(reportId ?? '')
  const ids = useMemo(() => answer?.image_ids ?? [], [answer?.image_ids])
  // Senaste listan, så att flera uppladdningar efter varandra inte skriver över varandra.
  const idsRef = useRef(ids)
  useEffect(() => {
    idsRef.current = ids
  }, [ids])
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const max = question.max_images
  const full = ids.length + pending >= max

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (!reportId || files.length === 0) return
    setError(null)
    const room = max - idsRef.current.length - pending
    if (files.length > room) setError(`Du kan skicka högst ${max} ${max === 1 ? 'bild' : 'bilder'}.`)
    const chosen = files.slice(0, Math.max(0, room))
    setPending((n) => n + chosen.length)
    // En i taget, så att ordningen blir den eleven valde.
    for (const file of chosen) {
      try {
        const image = await upload.mutateAsync({ questionId: question.id, file })
        const next = [...idsRef.current, image.id]
        idsRef.current = next
        onChange({ image_ids: next })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Bilden gick inte att spara. Försök igen.')
      } finally {
        setPending((n) => n - 1)
      }
    }
  }

  function removeImage(id: string) {
    const next = idsRef.current.filter((i) => i !== id)
    idsRef.current = next
    onChange({ image_ids: next })
    remove.mutate(id)
  }

  return (
    <div className={styles.input}>
      {(ids.length > 0 || pending > 0) && (
        <ul className={styles.grid} aria-label="Dina bilder">
          {ids.map((id, i) => (
            <li key={id} className={styles.tile}>
              <img src={reportImageUrl(reportId ?? '', id)} alt={`Bild ${i + 1}`} className={styles.thumb} />
              <button
                type="button"
                className={styles.remove}
                aria-label={`Ta bort bild ${i + 1}`}
                onClick={() => removeImage(id)}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
          {Array.from({ length: pending }, (_, i) => (
            <li key={`pending-${i}`} className={`${styles.tile} ${styles.saving}`}>
              <span className={styles.spinner} aria-hidden="true" />
              Sparar…
            </li>
          ))}
        </ul>
      )}
      {(ids.length > 0 || pending > 0) && (
        <p className={styles.count}>
          {ids.length} av {max} {max === 1 ? 'bild' : 'bilder'}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void addFiles(e)}
      />
      {!full && (
        <button
          type="button"
          className={ids.length > 0 || pending > 0 ? styles.addSmall : styles.addLarge}
          disabled={!reportId}
          onClick={() => inputRef.current?.click()}
        >
          <span className={styles.addIcon}>
            <Camera aria-hidden="true" />
          </span>
          <span className={styles.addText}>Ta foto eller välj bilder</span>
          {ids.length === 0 && pending === 0 && (
            <span className={styles.addHint}>
              {reportId ? `Kameran eller bilderna i mobilen. Högst ${max}.` : 'Går inte i förhandsgranskningen.'}
            </span>
          )}
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
