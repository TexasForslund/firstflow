import { FileText, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { useCreateContract } from '../../api/contracts'
import { useWorkplaces } from '../../api/placements'
import { useStudentPlacements, useStudents } from '../../api/students'
import { Avatar, Button, matches, SelectField, TextField } from '../../components'
import dialog from '../projects/ProjectDialog.module.css'
import styles from './Contracts.module.css'

const MAX_BYTES = 10 * 1024 * 1024

function sizeText(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Nytt kontrakt i en popup som täcker nästan hela skärmen. Till vänster PDF:en, namnet och
 * perioden. Till höger vem som signerar: eleven, företagets handledare och läraren (du).
 */
export function NewContractDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    // Ingen close() vid avmontering, se AddQuestionDialog.
    const node = ref.current
    if (node && !node.open) node.showModal()
  }, [])

  const navigate = useNavigate()
  const create = useCreateContract()
  const students = useStudents()
  const workplaces = useWorkplaces()

  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [studentId, setStudentId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [workplaceId, setWorkplaceId] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [send, setSend] = useState(true)

  const placements = useStudentPlacements(studentId, Boolean(studentId))
  const student = students.data?.find((s) => s.id === studentId)
  const workplace = workplaces.data?.find((w) => w.id === workplaceId)

  // Förhandsvisning av den valda PDF:en. Adressen släpps när filen byts eller rutan stängs.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  // Företag, handledare och period hämtas från elevens praktikplats.
  const placement = placements.data?.[0]
  const [prefilledFor, setPrefilledFor] = useState('')
  if (placement && prefilledFor !== studentId) {
    setPrefilledFor(studentId)
    setWorkplaceId(placement.workplace.id)
    setSupervisorId(placement.supervisor.id)
    setStartDate(placement.start_date)
    setEndDate(placement.end_date)
  }

  function chooseStudent(id: string) {
    setStudentId(id)
    const name = students.data?.find((s) => s.id === id)?.name
    if (!titleTouched && name) setTitle(`Utbildningskontrakt APL – ${name}`)
  }

  function chooseFile(next: File | undefined) {
    setFileError('')
    if (!next) return
    if (next.type !== 'application/pdf' && !next.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Välj en PDF-fil.')
      return
    }
    if (next.size > MAX_BYTES) {
      setFileError('PDF:en får vara högst 10 MB.')
      return
    }
    setFile(next)
  }

  function chooseWorkplace(id: string) {
    setWorkplaceId(id)
    const first = workplaces.data?.find((w) => w.id === id)?.supervisors[0]
    setSupervisorId(first?.id ?? '')
  }

  const missing = !file
    ? 'Ladda upp kontraktet som PDF.'
    : !studentId
      ? 'Välj elev.'
      : !workplaceId || !supervisorId
        ? 'Välj företag och handledare.'
        : ''

  function submit(event: FormEvent, sendNow: boolean) {
    event.preventDefault()
    if (missing || !file) return
    setSend(sendNow)
    create.mutate(
      { file, title, studentId, workplaceId, supervisorId, startDate, endDate, send: sendNow },
      { onSuccess: (contract) => navigate(`/contracts/${contract.id}`) },
    )
  }

  const visibleStudents = (students.data ?? []).filter(
    (s) => s.id === studentId || matches(s.name, studentSearch) || matches(s.email, studentSearch),
  )

  return (
    <dialog
      ref={ref}
      className={dialog.dialog}
      aria-labelledby="contract-dialog-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <form className={dialog.frame} onSubmit={(e) => submit(e, true)}>
        <header className={dialog.header}>
          <h1 id="contract-dialog-title" className={dialog.title}>
            Nytt kontrakt
          </h1>
          <button type="button" className={dialog.close} aria-label="Stäng" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={dialog.body} data-owner="">
          <div className={dialog.left}>
            <div className={dialog.field}>
              <span className={dialog.label}>Kontraktet som PDF</span>
              {file ? (
                <div className={styles.fileBox}>
                  <span className={styles.pdfIcon} aria-hidden="true">
                    PDF
                  </span>
                  <span className={styles.fileText}>
                    <span className={styles.name}>{file.name}</span>
                    <span className={styles.muted}>{sizeText(file.size)}</span>
                  </span>
                  <label className={styles.fileButton}>
                    Byt fil
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      onChange={(e) => chooseFile(e.target.files?.[0])}
                    />
                  </label>
                </div>
              ) : (
                <label
                  className={styles.dropZone}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    chooseFile(e.dataTransfer.files[0])
                  }}
                >
                  <FileText aria-hidden="true" />
                  <span>
                    <strong>Välj en PDF</strong> eller dra den hit
                  </span>
                  <span className={styles.muted}>Högst 10 MB</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(e) => chooseFile(e.target.files?.[0])}
                  />
                </label>
              )}
              {fileError && (
                <span className={styles.error} role="alert">
                  {fileError}
                </span>
              )}
              <span className={dialog.hint}>
                Ladda upp skolans kontrakt. Senare kan Firstflow fylla i en mall åt dig.
              </span>
            </div>

            <TextField
              label="Namn på kontraktet"
              required
              maxLength={200}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
            />
            <div className={dialog.pair}>
              <TextField
                label="APL från"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <TextField label="APL till" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {placement && <span className={dialog.hint}>Perioden är hämtad från elevens praktikplats.</span>}

            <div className={styles.previewBox}>
              {preview ? (
                <iframe title="Förhandsvisning av kontraktet" src={preview} className={styles.previewFrame} />
              ) : (
                <span className={styles.muted}>Förhandsvisningen visas här när du har valt en PDF.</span>
              )}
            </div>
          </div>

          <div className={dialog.right}>
            <h2 className={dialog.sectionTitle}>Vem ska signera?</h2>

            <div className={dialog.field}>
              <span className={dialog.label}>1. Elev</span>
              <label className={dialog.searchBox}>
                <Search aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Sök elev"
                  placeholder="Sök elev eller e-post"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
              </label>
              <div className={`${dialog.options} ${styles.studentOptions}`} role="radiogroup" aria-label="Elev">
                {students.isPending && <p className={dialog.hint}>Hämtar elever…</p>}
                {visibleStudents.map((s) => (
                  <label key={s.id} className={dialog.option} data-checked={s.id === studentId ? '' : undefined}>
                    <input
                      type="radio"
                      name="student"
                      checked={s.id === studentId}
                      onChange={() => chooseStudent(s.id)}
                    />
                    <Avatar name={s.name} size="sm" />
                    <span className={dialog.optionText}>
                      <span className={dialog.optionName}>{s.name}</span>
                      <span className={dialog.optionMeta}>
                        {[s.email, s.classes.map((c) => c.name).join(', ')].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className={dialog.field}>
              <span className={dialog.label}>2. Företag och handledare</span>
              <div className={dialog.pair}>
                <SelectField label="Företag" value={workplaceId} onChange={chooseWorkplace}>
                  <option value="">Välj företag</option>
                  {(workplaces.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Handledare" value={supervisorId} onChange={setSupervisorId}>
                  <option value="">Välj handledare</option>
                  {(workplace?.supervisors ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              {placement && student && (
                <span className={dialog.hint}>Förvalt från {student.name.split(' ')[0]}s praktikplats.</span>
              )}
            </div>

            <div className={dialog.field}>
              <span className={dialog.label}>3. Lärare</span>
              <p className={styles.teacherBox}>Du signerar för skolan när du skickar kontraktet.</p>
            </div>

            <p className={styles.testNote}>
              Testläge: parterna signerar med en knapp i Firstflow. BankID kopplas in när signeringstjänsten är vald.
            </p>
          </div>
        </div>

        <footer className={dialog.footer}>
          <span className={styles.footerNote}>
            {create.isError ? (
              <span className={styles.error} role="alert">
                {create.error.message}
              </span>
            ) : (
              missing || '3 parter signerar: elev, handledare och lärare'
            )}
          </span>
          <Button onClick={onClose}>Avbryt</Button>
          <Button disabled={Boolean(missing) || create.isPending} onClick={(e) => submit(e, false)}>
            {create.isPending && !send ? 'Sparar…' : 'Spara utkast'}
          </Button>
          <Button type="submit" variant="primary" disabled={Boolean(missing) || create.isPending}>
            {create.isPending && send ? 'Skickar…' : 'Skicka för signering'}
          </Button>
        </footer>
      </form>
    </dialog>
  )
}
