import { AlertCircle, Check, Download, FileText, Mail, Upload } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'

import {
  useImportPreview,
  useRunImport,
  type ImportPerson,
  type ImportPreview,
  type ImportResult,
} from '../../api/imports'
import { Button, HelpPopover } from '../../components'
import styles from './Import.module.css'

const STEPS = ['Ladda upp fil', 'Välj klasser', 'Förhandsvisning', 'Klart']

/**
 * Import av elever och personal för skoladmin (B20, Texas 2026-11-02): ladda upp en fil enligt
 * mallen, välj klasserna med APL, se vad som händer och importera. Inget sparas förrän
 * skoladmin trycker Importera. De nya får ett mejl där de väljer sitt lösenord.
 */
export function Import() {
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [sendInvites, setSendInvites] = useState(true)
  const [classes, setClasses] = useState<ImportPreview | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const analyze = useImportPreview()
  const run = useRunImport()

  function choose(chosen: File) {
    setFile(chosen)
    analyze.mutate(
      { file: chosen, classes: [] },
      {
        onSuccess: (data) => {
          setClasses(data)
          // Klasser som redan finns i Firstflow har troligen APL.
          setSelected(data.file_classes.filter((c) => c.exists).map((c) => c.name))
          setStep(1)
        },
      },
    )
  }

  function showPreview() {
    if (!file) return
    analyze.mutate({ file, classes: selected }, { onSuccess: (data) => (setPreview(data), setStep(2)) })
  }

  function importFile() {
    if (!file) return
    run.mutate({ file, classes: selected, sendInvites }, { onSuccess: (data) => (setResult(data), setStep(3)) })
  }

  function restart() {
    setFile(null)
    setClasses(null)
    setPreview(null)
    setResult(null)
    setSelected([])
    analyze.reset()
    run.reset()
    setStep(0)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Importera elever och personal</h1>
        <p className={styles.subtitle}>Från en fil, till exempel en export ur skolans system.</p>
      </header>

      <ol className={styles.steps} aria-label="Steg">
        {STEPS.map((label, i) => (
          <li key={label} className={styles.step} data-state={i < step ? 'done' : i === step ? 'current' : undefined}>
            <span className={styles.stepNumber} aria-hidden="true">
              {i < step ? <Check /> : i + 1}
            </span>
            {label}
            {i === step && <span className="sr-only"> (nu)</span>}
          </li>
        ))}
      </ol>

      {analyze.isError && (
        <p className={styles.error} role="alert">
          <AlertCircle aria-hidden="true" /> {analyze.error.message}
        </p>
      )}

      {step === 0 && <UploadStep busy={analyze.isPending} onFile={choose} />}

      {step === 1 && classes && (
        <ClassStep
          file={file}
          data={classes}
          selected={selected}
          onToggle={(name) => setSelected((s) => (s.includes(name) ? s.filter((n) => n !== name) : [...s, name]))}
          onAll={() => setSelected(classes.file_classes.map((c) => c.name))}
          onBack={restart}
          onNext={showPreview}
          busy={analyze.isPending}
        />
      )}

      {step === 2 && preview && (
        <PreviewStep
          data={preview}
          sendInvites={sendInvites}
          onInvites={setSendInvites}
          onBack={() => setStep(1)}
          onImport={importFile}
          busy={run.isPending}
          error={run.error?.message}
        />
      )}

      {step === 3 && result && <DoneStep result={result} onAgain={restart} />}
    </div>
  )
}

function UploadStep({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <>
      <div
        className={styles.drop}
        data-dragging={dragging || undefined}
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <span className={styles.dropIcon} aria-hidden="true">
          <Upload />
        </span>
        <span className={styles.dropTitle}>{busy ? 'Läser filen…' : 'Släpp filen här eller välj fil'}</span>
        <span className={styles.muted}>
          Excel (.xlsx) eller CSV. Inget sparas förrän du har sett förhandsvisningen.
        </span>
        <Button variant="primary" disabled={busy} onClick={() => input.current?.click()}>
          Välj fil
        </Button>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onFile(file)
          }}
        />
      </div>

      <section className={styles.section} aria-labelledby="template-title">
        <div className={styles.sectionHead}>
          <h2 id="template-title" className={styles.sectionTitle}>
            Mallen <HelpPopover topic="importTemplate" />
          </h2>
          <span className={styles.links}>
            <a className={styles.download} href="/api/import/template?format=xlsx" download>
              <Download aria-hidden="true" /> Ladda ner mall (Excel)
            </a>
            <a className={styles.download} href="/api/import/template?format=csv" download>
              <Download aria-hidden="true" /> CSV
            </a>
          </span>
        </div>
        <div className={styles.tableBox}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Kolumn</th>
                <th scope="col">Betyder</th>
                <th scope="col">Exempel</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['id', 'SS12000-id, om det finns', 'a3f9…'],
                ['förnamn', '', 'Hugo'],
                ['efternamn', '', 'Karlsson'],
                ['e-post', 'Inbjudan skickas hit', 'hugo.karlsson@skola.se'],
                ['roll', 'Elev, Lärare, SYV eller Rektor', 'Elev'],
                ['klass', 'Klassens namn, för elever och lärare', 'EL23'],
                ['skolform', 'GY eller VUXGY (valfri)', 'GY'],
              ].map(([column, meaning, example]) => (
                <tr key={column}>
                  <th scope="row">{column}</th>
                  <td>{meaning}</td>
                  <td className={styles.mono}>{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function ClassStep({
  file,
  data,
  selected,
  onToggle,
  onAll,
  onBack,
  onNext,
  busy,
}: {
  file: File | null
  data: ImportPreview
  selected: string[]
  onToggle: (name: string) => void
  onAll: () => void
  onBack: () => void
  onNext: () => void
  busy: boolean
}) {
  const students = data.file_classes.reduce((sum, c) => sum + c.students, 0)
  return (
    <>
      <p className={styles.fileLine}>
        <FileText aria-hidden="true" /> {file?.name} · {students} elever i {data.file_classes.length} klasser
        {data.errors.length > 0 && ` · ${data.errors.length} rader med fel`}
      </p>
      <section className={styles.section} aria-labelledby="classes-title">
        <div>
          <h2 id="classes-title" className={styles.sectionTitle}>
            Vilka klasser har APL? <HelpPopover topic="importClasses" />
          </h2>
          <p className={styles.muted}>Bara de valda klasserna kommer in i Firstflow. Resten av filen hoppas över.</p>
        </div>
        {data.file_classes.length === 0 ? (
          <p className={styles.muted}>Filen har inga klasser. Elever behöver en klass i kolumnen klass.</p>
        ) : (
          <fieldset className={styles.classList}>
            <legend className={styles.classListHead}>
              <span>
                {selected.length} av {data.file_classes.length} valda
              </span>
              <button type="button" className={styles.link} onClick={onAll}>
                Välj alla
              </button>
            </legend>
            {data.file_classes.map((c) => (
              <label key={c.name} className={styles.classRow} data-on={selected.includes(c.name) || undefined}>
                <input type="checkbox" checked={selected.includes(c.name)} onChange={() => onToggle(c.name)} />
                <span className={styles.className}>
                  {c.name}
                  {c.exists && <span className={styles.badge}>Finns redan</span>}
                </span>
                <span className={styles.muted}>
                  {c.students} elever · {c.teachers} lärare
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </section>
      <div className={styles.actions}>
        <Button onClick={onBack}>Byt fil</Button>
        <Button variant="primary" disabled={busy || selected.length === 0} onClick={onNext}>
          {busy ? 'Räknar…' : 'Visa förhandsvisning'}
        </Button>
      </div>
    </>
  )
}

function roleCounts(people: ImportPerson[]): string {
  const count = (role: string) => people.filter((p) => p.role === role).length
  const parts = [
    [count('Elev'), 'elev', 'elever'],
    [count('Lärare'), 'lärare', 'lärare'],
    [count('SYV'), 'SYV', 'SYV'],
    [count('Rektor'), 'rektor', 'rektorer'],
  ] as const
  return (
    parts
      .filter(([n]) => n > 0)
      .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
      .join(', ') || 'Inga'
  )
}

function PreviewStep({
  data,
  sendInvites,
  onInvites,
  onBack,
  onImport,
  busy,
  error,
}: {
  data: ImportPreview
  sendInvites: boolean
  onInvites: (value: boolean) => void
  onBack: () => void
  onImport: () => void
  busy: boolean
  error?: string
}) {
  const total = data.new.length + data.changed.length + data.leaving.length
  return (
    <>
      <div className={styles.cards}>
        <Summary tone="new" count={data.new.length} label="Nya" sub={roleCounts(data.new)} people={data.new} />
        <Summary
          tone="changed"
          count={data.changed.length}
          label="Ändras"
          sub="Nytt namn, ny e-post eller ny klass"
          people={data.changed}
        />
        <Summary
          tone="leaving"
          count={data.leaving.length}
          label="Lämnar klassen"
          sub="Kopplingen tas bort"
          people={data.leaving}
          help
        />
        <Summary tone="error" count={data.errors.length} label="Rader med fel" sub="Hoppas över" />
      </div>

      {data.errors.length > 0 && (
        <section className={styles.section} aria-labelledby="errors-title">
          <h2 id="errors-title" className={`${styles.sectionTitle} ${styles.errorTitle}`}>
            <AlertCircle aria-hidden="true" /> {data.errors.length} {data.errors.length === 1 ? 'rad' : 'rader'} med fel
          </h2>
          <ul className={styles.errorList}>
            {data.errors.map((e) => (
              <li key={`${e.row}-${e.message}`}>
                <span className={styles.rowNumber}>Rad {e.row}</span>
                {e.message}
              </li>
            ))}
          </ul>
          <p className={styles.muted}>Rätta filen och ladda upp den igen, eller importera resten nu.</p>
        </section>
      )}

      <section className={styles.section} aria-labelledby="plan-title">
        <h2 id="plan-title" className={styles.sectionTitle}>
          Klasserna
        </h2>
        <ul className={styles.planList}>
          {data.classes.map((c) => (
            <li key={c.name}>
              <span className={styles.className}>{c.name}</span>
              <span className={styles.muted}>
                {[
                  c.exists ? 'Finns redan' : 'Ny klass',
                  c.new_students && `${c.new_students} nya elever`,
                  c.changed && `${c.changed} ändras`,
                  c.leaving && `${c.leaving} lämnar`,
                  c.teachers.length ? `lärare ${c.teachers.join(', ')}` : 'ingen lärare i filen',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
        {data.skipped > 0 && (
          <p className={styles.muted}>
            {data.skipped} {data.skipped === 1 ? 'rad' : 'rader'} i andra klasser hoppas över.
          </p>
        )}
      </section>

      {data.new.length > 0 && (
        <label className={styles.invite}>
          <input type="checkbox" checked={sendInvites} onChange={(e) => onInvites(e.target.checked)} />
          <span>
            <span className={styles.inviteTitle}>Skicka inbjudan via mejl till de {data.new.length} nya</span>
            <span className={styles.muted}>
              De får en länk och väljer sitt eget lösenord. Länken gäller i 14 dagar.
            </span>
          </span>
          <HelpPopover topic="importInvite" align="end" />
        </label>
      )}

      {error && (
        <p className={styles.error} role="alert">
          <AlertCircle aria-hidden="true" /> {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={onBack}>Tillbaka</Button>
        <Button variant="primary" disabled={busy || total === 0} onClick={onImport}>
          {busy ? 'Importerar…' : total === 0 ? 'Inget att importera' : `Importera ${total} personer`}
        </Button>
      </div>
    </>
  )
}

function Summary({
  tone,
  count,
  label,
  sub,
  people,
  help,
}: {
  tone: 'new' | 'changed' | 'leaving' | 'error'
  count: number
  label: string
  sub: string
  people?: ImportPerson[]
  help?: boolean
}) {
  return (
    <div className={styles.card} data-tone={tone}>
      <span className={styles.cardCount}>{count}</span>
      <span className={styles.cardLabel}>
        {label} {help && <HelpPopover topic="importLeaving" />}
      </span>
      <span className={styles.cardSub}>{sub}</span>
      {people && people.length > 0 && (
        <details className={styles.people}>
          <summary>Visa</summary>
          <ul>
            {people.map((p) => (
              <li key={`${p.email}-${p.class_name}`}>
                <strong>{p.name}</strong> {p.role}
                {p.class_name && `, ${p.class_name}`}
                {p.what && ` (${p.what})`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function DoneStep({ result, onAgain }: { result: ImportResult; onAgain: () => void }) {
  return (
    <>
      <section className={styles.done}>
        <span className={styles.doneTitle}>
          <span className={styles.doneIcon} aria-hidden="true">
            <Check />
          </span>
          Importen är klar
        </span>
        <span>
          {result.created} nya, {result.changed} ändrade och {result.left} som lämnade klassen.
          {result.errors > 0 && ` ${result.errors} ${result.errors === 1 ? 'rad' : 'rader'} hoppades över.`}
        </span>
      </section>
      <section className={styles.section} aria-labelledby="invites-title">
        <h2 id="invites-title" className={styles.sectionTitle}>
          <Mail aria-hidden="true" className={styles.titleIcon} /> Inbjudningar
        </h2>
        <p>
          {result.invited > 0
            ? `${result.invited} ${result.invited === 1 ? 'inbjudan skickades' : 'inbjudningar skickades'}. De väljer sitt lösenord via länken i mejlet.`
            : 'Inga inbjudningar skickades.'}
        </p>
      </section>
      <section className={styles.section} aria-labelledby="next-title">
        <h2 id="next-title" className={styles.sectionTitle}>
          Nästa steg för lärarna
        </h2>
        <p>Lärarna ser sina klasser när de loggar in. De fyller i APL-dagar och redovisningsdagar under APL-villkor.</p>
      </section>
      <div className={styles.actionsStart}>
        <Link to="/classes" className={styles.primaryLink}>
          Till klasserna
        </Link>
        <Button onClick={onAgain}>Importera en fil till</Button>
      </div>
    </>
  )
}
