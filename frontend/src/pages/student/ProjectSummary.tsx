import { Camera, Check, Flag, X } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import {
  MAX_SUMMARY_IMAGES,
  mySummaryImageUrl,
  useMySummary,
  usePendingSummaries,
  useSaveSummary,
  useUploadSummaryImage,
  type SummaryForm,
} from '../../api/projectSummaries'
import { StarRating } from '../../components'
import styles from './ProjectSummary.module.css'

/**
 * Kortet "Projektet är klart!" på elevens startsida (idé 12:6 steg 2, Texas skiss 2026-11-08).
 * "Inte nu" döljer kortet tills eleven öppnar Firstflow nästa gång.
 */
export function ProjectDoneCards() {
  const pending = usePendingSummaries()
  const [hidden, setHidden] = useState<string[]>([])
  const shown = (pending.data ?? []).filter((p) => !hidden.includes(p.project_id))
  if (shown.length === 0) return null
  return (
    <>
      {shown.map((p) => (
        <section key={p.project_id} className={styles.doneCard} aria-labelledby={`done-${p.project_id}`}>
          <div className={styles.doneHead}>
            <span className={styles.doneIcon}>
              <Flag aria-hidden="true" />
            </span>
            <span className={styles.doneText}>
              <span id={`done-${p.project_id}`} className={styles.doneTitle}>
                Projektet är klart!
              </span>
              <span className={styles.doneProject}>{p.project_name}</span>
            </span>
          </div>
          <p>Fyra korta frågor om hur det gick. Det tar en minut.</p>
          <Link to={`/my-projects/${p.project_id}/summary`} className={styles.primary}>
            Sammanfatta projektet
          </Link>
          <button type="button" className={styles.later} onClick={() => setHidden([...hidden, p.project_id])}>
            Inte nu
          </button>
        </section>
      ))}
    </>
  )
}

/** Sidan med de fyra frågorna, en i taget som en story. */
export function ProjectSummaryPage() {
  const { projectId = '' } = useParams()
  const query = useMySummary(projectId)
  if (query.isPending) return <p className={styles.state}>Laddar…</p>
  if (query.isError) return <p className={styles.state}>Projektet finns inte, eller så är du inte med i det.</p>
  if (!query.data.completed) {
    return (
      <div className={styles.page}>
        <p className={styles.state}>Projektet är inte klart än. Läraren eller handledaren markerar när det är klart.</p>
        <Link to={`/my-projects/${projectId}`} className={styles.secondary}>
          Till projektet
        </Link>
      </div>
    )
  }
  return <Steps key={projectId} form={query.data} />
}

function Steps({ form }: { form: SummaryForm }) {
  const navigate = useNavigate()
  const save = useSaveSummary(form.project_id)
  const upload = useUploadSummaryImage(form.project_id)
  const [step, setStep] = useState(0)
  const [rating, setRating] = useState(form.summary?.rating ?? 0)
  const [best, setBest] = useState(form.summary?.best ?? '')
  const [goalIds, setGoalIds] = useState<string[]>(form.summary?.goal_ids ?? [])
  const [imageIds, setImageIds] = useState<string[]>(form.summary?.image_ids ?? [])
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const close = () => navigate('/my-reports')

  // Projekt utan mål hoppar över målfrågan.
  const steps = form.goals.length > 0 ? [0, 1, 2, 3] : [0, 1, 3]
  const at = steps.indexOf(step)
  const last = at === steps.length - 1
  const canGoOn = step === 0 ? rating > 0 : step === 1 ? best.trim().length > 0 : pending === 0

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    setError(null)
    const room = MAX_SUMMARY_IMAGES - imageIds.length - pending
    if (files.length > room) setError(`Du kan skicka högst ${MAX_SUMMARY_IMAGES} bilder.`)
    const chosen = files.slice(0, Math.max(0, room))
    setPending((n) => n + chosen.length)
    for (const file of chosen) {
      try {
        const image = await upload.mutateAsync(file)
        setImageIds((ids) => [...ids, image.id])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Bilden gick inte att spara. Försök igen.')
      } finally {
        setPending((n) => n - 1)
      }
    }
  }

  function next() {
    if (!last) {
      setStep(steps[at + 1])
      return
    }
    save.mutate(
      { rating, best: best.trim(), goal_ids: goalIds, image_ids: imageIds },
      { onSuccess: () => setDone(true) },
    )
  }

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.thanks}>
          <span className={styles.thanksIcon}>
            <Check aria-hidden="true" />
          </span>
          <h1 className={styles.question}>Tack!</h1>
          <p className={styles.hint}>Läraren och handledaren ser din sammanfattning av {form.project_name}.</p>
          <Link to="/my-reports" className={styles.primary}>
            Klar
          </Link>
          <Link to={`/my-projects/${form.project_id}`} className={styles.secondary}>
            Till projektet
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <div className={styles.progress} aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s} className={i <= at ? styles.segmentDone : styles.segment} />
          ))}
        </div>
        <div className={styles.topRow}>
          <span className={styles.topText}>
            <span className={styles.topTitle}>Sammanfatta projektet</span>
            <span className={styles.hint}>{form.project_name}</span>
          </span>
          <button type="button" className={styles.close} aria-label="Stäng" onClick={close}>
            <X aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.body}>
        <span className={styles.count}>
          {at + 1} av {steps.length}
          {step === 3 && ' · Valfri'}
        </span>
        {step === 0 && (
          <>
            <h1 className={styles.question}>Hur gick projektet?</h1>
            <p className={styles.hint}>Tryck på en stjärna.</p>
            <StarRating value={rating} onChange={setRating} label="Hur gick projektet" />
          </>
        )}
        {step === 1 && (
          <>
            <h1 className={styles.question}>
              <label htmlFor="summary-best">Vad är du mest nöjd med?</label>
            </h1>
            <p className={styles.hint}>En mening räcker.</p>
            <textarea
              id="summary-best"
              className={styles.text}
              rows={3}
              maxLength={300}
              value={best}
              onChange={(e) => setBest(e.target.value)}
            />
          </>
        )}
        {step === 2 && (
          <fieldset className={styles.goals}>
            <legend className={styles.question}>Vilka mål tycker du att du visade?</legend>
            <p className={styles.hint}>Välj de du tycker att du klarade.</p>
            {form.goals.map((goal) => {
              const on = goalIds.includes(goal.id)
              return (
                <label key={goal.id} className={styles.goal} data-on={on ? '' : undefined}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setGoalIds(on ? goalIds.filter((id) => id !== goal.id) : [...goalIds, goal.id])}
                  />
                  <span className={styles.goalText}>
                    <span className={styles.goalName}>{goal.name}</span>
                    {goal.group && <span className={styles.hint}>{goal.group}</span>}
                  </span>
                </label>
              )
            })}
          </fieldset>
        )}
        {step === 3 && (
          <>
            <h1 className={styles.question}>Bild på slutresultatet</h1>
            <p className={styles.hint}>Visa hur det blev. Högst {MAX_SUMMARY_IMAGES} bilder.</p>
            {imageIds.length + pending > 0 && (
              <ul className={styles.grid}>
                {imageIds.map((id, i) => (
                  <li key={id} className={styles.tile}>
                    <img className={styles.thumb} src={mySummaryImageUrl(form.project_id, id)} alt={`Bild ${i + 1}`} />
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Ta bort bild ${i + 1}`}
                      onClick={() => setImageIds(imageIds.filter((x) => x !== id))}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {Array.from({ length: pending }, (_, i) => (
                  <li key={`pending-${i}`} className={styles.tile} aria-label="Laddar upp">
                    <span className={styles.spinner} />
                  </li>
                ))}
              </ul>
            )}
            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addFiles(e)} />
            <button
              type="button"
              className={styles.secondary}
              disabled={imageIds.length + pending >= MAX_SUMMARY_IMAGES}
              onClick={() => inputRef.current?.click()}
            >
              <Camera aria-hidden="true" /> Ta foto eller välj bilder
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </>
        )}
        {save.isError && <p className={styles.error}>{save.error.message}</p>}
        <button type="button" className={styles.next} disabled={!canGoOn || save.isPending} onClick={next}>
          {last ? (save.isPending ? 'Skickar…' : 'Skicka') : 'Nästa'}
        </button>
      </div>
    </div>
  )
}
