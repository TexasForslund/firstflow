import { CalendarDays, Minus, PenLine, Thermometer, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { useReview, type ReviewItem } from '../../api/attendance'
import { type AbsenceReason } from './absence'
import styles from './AbsenceDialog.module.css'

const CHOICES: { value: AbsenceReason | ''; label: string; icon: LucideIcon }[] = [
  { value: 'sick', label: 'Sjuk', icon: Thermometer },
  { value: 'leave', label: 'Ledig', icon: CalendarDays },
  { value: 'other', label: 'Annat', icon: PenLine },
  { value: '', label: 'Ingen förklaring', icon: Minus },
]

function dayText(iso: string, today: string) {
  if (iso === today) return 'i dag'
  return new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * "Inte på plats" med en valfri förklaring: Sjuk, Ledig, Annat eller Ingen förklaring, och en
 * kort kommentar. Läraren ser förklaringen, eleven gör det inte. I mobilen kommer rutan nerifrån.
 */
export function AbsenceDialog({ item, today, onClose }: { item: ReviewItem; today: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const review = useReview()
  const [reason, setReason] = useState<AbsenceReason | ''>(item.absence_reason ?? '')
  const [note, setNote] = useState(item.absence_note ?? '')
  const firstName = item.student.name.split(' ')[0]

  useEffect(() => {
    const node = ref.current
    if (node && !node.open) node.showModal()
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    review.mutate(
      [
        {
          placement_id: item.placement_id,
          date: item.date,
          verdict: 'not_present',
          absence_reason: reason || null,
          absence_note: note.trim() || null,
        },
      ],
      { onSuccess: () => ref.current?.close() },
    )
  }

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="absence-title">
      <form className={styles.frame} onSubmit={submit}>
        <span className={styles.handle} aria-hidden="true" />
        <header className={styles.head}>
          <h2 id="absence-title" className={styles.title}>
            Varför var {firstName} inte på plats?
          </h2>
          <button type="button" className={styles.close} aria-label="Stäng" onClick={() => ref.current?.close()}>
            <X aria-hidden="true" />
          </button>
        </header>
        <p className={styles.muted}>
          Gäller {dayText(item.date, today)}. Välj om du vet. Läraren ser det du väljer, men inte {firstName}.
        </p>
        <fieldset className={styles.choices}>
          <legend className="sr-only">Förklaring</legend>
          {CHOICES.map((c) => (
            <label key={c.label} className={styles.choice} data-on={reason === c.value ? '' : undefined}>
              <input
                type="radio"
                name="reason"
                value={c.value}
                checked={reason === c.value}
                onChange={() => setReason(c.value)}
              />
              <c.icon aria-hidden="true" />
              {c.label}
            </label>
          ))}
        </fieldset>
        <label className={styles.field}>
          <span className={styles.label}>
            Kommentar <span className={styles.optional}>(valfritt)</span>
          </span>
          <input
            className={styles.input}
            value={note}
            maxLength={300}
            placeholder="T.ex. sjukanmäld via sms kl. 06:40"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {review.isError && (
          <p className={styles.error} role="alert">
            {review.error.message}
          </p>
        )}
        <footer className={styles.foot}>
          <button type="button" className={styles.secondary} onClick={() => ref.current?.close()}>
            Avbryt
          </button>
          <button type="submit" className={styles.primary} disabled={review.isPending}>
            <X aria-hidden="true" /> Spara: inte på plats
          </button>
        </footer>
      </form>
    </dialog>
  )
}
