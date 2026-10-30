import { BookmarkPlus, CircleCheck, Eye, LayoutTemplate, LoaderCircle, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  useClassForm,
  useDiscardForm,
  usePublishForm,
  useSaveDraft,
  type FormRead,
  type Question,
  type QuestionType,
} from '../../../api/forms'
import { Button, Card } from '../../../components'
import { ReportStepper } from '../../reports/ReportStepper'
import classStyles from '../Classes.module.css'
import { AddQuestionDialog } from './AddQuestionDialog'
import { useClassTracks } from '../../../api/tracks'
import styles from './FormBuilder.module.css'
import { QuestionCanvas } from './QuestionCanvas'
import { QuestionList } from './QuestionList'
import { QuestionSettings } from './QuestionSettings'
import { SaveTemplateDialog, UseTemplateDialog } from './TemplateDialogs'
import {
  duplicateQuestion,
  newQuestion,
  QUESTION_TYPES,
  questionProblems,
  questionTitle,
  sanitizeLogic,
} from './questionTypes'
import { TypeBadge } from './TypeBadge'

const AUTOSAVE_DELAY_MS = 800

/** Fliken Frågor i klassvyn. Läraren och skoladmin bygger, rektor och superadmin ser. */
export function FormBuilder({ classId, canEdit }: { classId: string; canEdit: boolean }) {
  const form = useClassForm(classId)
  if (form.isPending) return <p className={classStyles.state}>Laddar frågorna…</p>
  if (form.isError) return <p className={classStyles.state}>Frågorna gick inte att hämta. Ladda om sidan.</p>
  if (!canEdit) return <ReadOnlyForm form={form.data} />
  return <Editor classId={classId} initial={form.data.draft.questions} />
}

function isValid(questions: Question[]) {
  return questions.every((q) => questionProblems(q).length === 0)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
}

function Editor({ classId, initial }: { classId: string; initial: Question[] }) {
  const meta = useClassForm(classId).data!
  const save = useSaveDraft(classId)
  const publish = usePublishForm(classId)
  const discard = useDiscardForm(classId)
  const tracks = useClassTracks(classId).data ?? []

  const [questions, setQuestions] = useState(initial)
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null)
  const [focusTitle, setFocusTitle] = useState(false)
  const [adding, setAdding] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [templateDialog, setTemplateDialog] = useState<'use' | 'save' | null>(null)

  // Senaste versionen av frågorna, och en kö så att sparningar alltid kommer i ordning.
  const latest = useRef(questions)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const dirtyRef = useRef(false)
  const mutateSave = save.mutateAsync

  const flush = useCallback((): Promise<boolean> => {
    const run = queue.current.then(async () => {
      const snapshot = latest.current
      if (!dirtyRef.current) return true
      if (!isValid(snapshot)) return false
      try {
        await mutateSave(snapshot)
        if (latest.current === snapshot) {
          dirtyRef.current = false
          setDirty(false)
        }
        return true
      } catch {
        return false
      }
    })
    queue.current = run
    return run
  }, [mutateSave])

  const valid = isValid(questions)

  // Spara automatiskt en kort stund efter att läraren slutat skriva.
  useEffect(() => {
    if (!dirty || !valid) return
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [questions, dirty, valid, flush])

  // Spara det som är kvar när läraren lämnar fliken, och varna om sidan stängs innan dess.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      void flush()
    }
  }, [flush])

  function update(next: Question[]) {
    const { questions: clean, removed } = sanitizeLogic(next)
    if (removed > 0) {
      setNotice(
        removed === 1
          ? 'En logikregel togs bort eftersom den inte längre pekade framåt.'
          : `${removed} logikregler togs bort eftersom de inte längre pekade framåt.`,
      )
    }
    latest.current = clean
    dirtyRef.current = true
    setQuestions(clean)
    setDirty(true)
    setFocusTitle(false)
    publish.reset()
  }

  function updateQuestion(question: Question) {
    update(questions.map((q) => (q.id === question.id ? question : q)))
  }

  function addQuestion(type: QuestionType) {
    const question = newQuestion(type)
    const at = selectedId ? questions.findIndex((q) => q.id === selectedId) + 1 : questions.length
    const next = [...questions]
    next.splice(at, 0, question)
    update(next)
    setSelectedId(question.id)
    setFocusTitle(true)
    setAdding(false)
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...questions]
    const [question] = next.splice(index, 1)
    next.splice(index + direction, 0, question)
    update(next)
  }

  function remove(index: number) {
    const next = questions.filter((_, i) => i !== index)
    update(next)
    setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null)
  }

  function duplicate(index: number) {
    const copy = duplicateQuestion(questions[index])
    const next = [...questions]
    next.splice(index + 1, 0, copy)
    update(next)
    setSelectedId(copy.id)
  }

  async function publishNow() {
    setNotice(null)
    if (!(await flush())) return
    publish.mutate()
  }

  async function discardNow() {
    setConfirmDiscard(false)
    await queue.current
    discard.mutate(undefined, {
      onSuccess: (form) => {
        const restored = form.draft.questions
        latest.current = restored
        dirtyRef.current = false
        setQuestions(restored)
        setDirty(false)
        setSelectedId(restored[0]?.id ?? null)
        setNotice('Ändringarna är borttagna. Frågorna är som i den publicerade versionen.')
      },
    })
  }

  function templateApplied(form: FormRead, name: string) {
    const replaced = form.draft.questions
    latest.current = replaced
    dirtyRef.current = false
    setQuestions(replaced)
    setDirty(false)
    setSelectedId(replaced[0]?.id ?? null)
    setTemplateDialog(null)
    publish.reset()
    setNotice(`Frågorna från mallen ${name} finns nu i utkastet. Ändra dem om du vill och publicera när du är klar.`)
  }

  const index = questions.findIndex((q) => q.id === selectedId)
  const selected = index >= 0 ? questions[index] : null
  const hasChanges = dirty || meta.has_unpublished_changes
  const problemCount = questions.filter((q) => questionProblems(q).length > 0).length

  return (
    <div className={styles.builder}>
      <div className={styles.bar}>
        <div className={styles.barStatus}>
          <p className={styles.version}>
            {meta.published_version
              ? `Version ${meta.published_version} publicerad ${formatDate(meta.published_at!)}`
              : 'Inte publicerad än. Eleverna ser inga frågor.'}
            {hasChanges && <span className={styles.changesTag}>Opublicerade ändringar</span>}
          </p>
          <SaveStatus
            saving={save.isPending || (dirty && valid)}
            error={save.isError ? save.error.message : null}
            problemCount={valid ? 0 : problemCount}
          />
        </div>
        <div className={styles.barActions}>
          <Button icon={<LayoutTemplate aria-hidden="true" />} onClick={() => setTemplateDialog('use')}>
            Använd mall
          </Button>
          <Button
            icon={<BookmarkPlus aria-hidden="true" />}
            onClick={() => setTemplateDialog('save')}
            disabled={questions.length === 0}
          >
            Spara som mall
          </Button>
          <Button
            icon={<Eye aria-hidden="true" />}
            onClick={() => setPreviewing(true)}
            disabled={questions.length === 0 || !valid}
          >
            Förhandsgranska
          </Button>
          {meta.published_version && hasChanges && !confirmDiscard && (
            <Button onClick={() => setConfirmDiscard(true)} disabled={discard.isPending}>
              Kasta ändringar
            </Button>
          )}
          {confirmDiscard && (
            <span className={styles.confirm} role="group" aria-label="Bekräfta">
              <span>Ta bort alla ändringar sedan publiceringen?</span>
              <Button onClick={discardNow}>Ja, kasta</Button>
              <Button onClick={() => setConfirmDiscard(false)}>Avbryt</Button>
            </span>
          )}
          <Button
            variant="primary"
            onClick={publishNow}
            disabled={!hasChanges || !valid || questions.length === 0 || publish.isPending}
          >
            Publicera ändringar
          </Button>
        </div>
      </div>

      <div aria-live="polite" className={styles.messages}>
        {publish.isSuccess && (
          <p className={styles.success}>
            <CircleCheck aria-hidden="true" /> Publicerat. Nya redovisningar får de här frågorna.
          </p>
        )}
        {publish.isError && <p className={styles.error}>{publish.error.message}</p>}
        {discard.isError && <p className={styles.error}>{discard.error.message}</p>}
        {notice && <p className={styles.notice}>{notice}</p>}
      </div>

      <div className={styles.columns}>
        <QuestionList
          questions={questions}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            setFocusTitle(false)
          }}
          onReorder={update}
          onAdd={() => setAdding(true)}
          tracks={tracks}
        />

        {selected ? (
          <>
            <QuestionCanvas
              question={selected}
              number={index + 1}
              total={questions.length}
              focusTitle={focusTitle}
              onChange={updateQuestion}
            />
            <QuestionSettings
              question={selected}
              questions={questions}
              index={index}
              onChange={updateQuestion}
              onMove={(direction) => move(index, direction)}
              onDuplicate={() => duplicate(index)}
              onDelete={() => remove(index)}
              tracks={tracks}
            />
          </>
        ) : (
          <section className={`${styles.canvas} ${styles.emptyCanvas}`}>
            <h2 className={styles.emptyTitle}>Inga frågor än</h2>
            <p className={styles.settingsHint}>
              Eleverna svarar på frågorna en i taget vid varje veckoredovisning. Börja med en fritextfråga, till exempel
              "Vad har du gjort i dag?".
            </p>
            <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setAdding(true)}>
              Lägg till fråga
            </Button>
          </section>
        )}
      </div>

      {adding && <AddQuestionDialog onPick={addQuestion} onClose={() => setAdding(false)} />}
      {templateDialog === 'use' && (
        <UseTemplateDialog
          classId={classId}
          hasQuestions={questions.length > 0}
          flush={flush}
          onApplied={templateApplied}
          onClose={() => setTemplateDialog(null)}
        />
      )}
      {templateDialog === 'save' && (
        <SaveTemplateDialog
          classId={classId}
          flush={flush}
          onSaved={(name) => {
            setTemplateDialog(null)
            setNotice(`Frågorna är sparade som mallen ${name}.`)
          }}
          onClose={() => setTemplateDialog(null)}
        />
      )}
      {previewing && (
        // Samma vy som eleven får. Inget sparas.
        <ReportStepper
          title="Så här ser eleven frågorna"
          badge="Förhandsgranskning"
          questions={questions}
          onSubmit={async () => {}}
          onClose={() => setPreviewing(false)}
          done={{
            title: 'Klart!',
            body: 'Här får eleven en bekräftelse på att redovisningen är inskickad. Inga svar sparades i förhandsgranskningen.',
            actions: <Button onClick={() => setPreviewing(false)}>Tillbaka till frågorna</Button>,
          }}
        />
      )}
    </div>
  )
}

function SaveStatus({ saving, error, problemCount }: { saving: boolean; error: string | null; problemCount: number }) {
  let content
  if (problemCount > 0) {
    content = `${problemCount === 1 ? 'En fråga behöver' : `${problemCount} frågor behöver`} fyllas i innan ändringarna sparas`
  } else if (error) {
    content = `Kunde inte spara: ${error}`
  } else if (saving) {
    content = (
      <>
        <LoaderCircle className={styles.spin} aria-hidden="true" /> Sparar…
      </>
    )
  } else {
    content = 'Alla ändringar är sparade'
  }
  return (
    <p className={problemCount > 0 || error ? styles.saveProblem : styles.saveStatus} role="status">
      {content}
    </p>
  )
}

function ReadOnlyForm({ form }: { form: FormRead }) {
  const questions = form.draft.questions
  return (
    <Card>
      <div className={classStyles.cardHeader}>
        <h2 className={classStyles.cardTitle}>Frågor vid redovisning</h2>
        <span className={classStyles.count}>
          {form.published_version ? `Version ${form.published_version}` : 'Inte publicerad'}
        </span>
      </div>
      {form.has_unpublished_changes && (
        <p className={styles.readOnlyNote}>Visar lärarens senaste ändringar, även de som inte är publicerade än.</p>
      )}
      {questions.length === 0 ? (
        <p className={classStyles.empty}>Läraren har inte lagt till några frågor än.</p>
      ) : (
        <ol className={styles.readOnly}>
          {questions.map((question, i) => (
            <li key={question.id}>
              <TypeBadge type={question.type} number={i + 1} />
              <span>
                <span className={styles.itemTitle}>{questionTitle(question)}</span>
                <span className={styles.itemType}>{QUESTION_TYPES[question.type].label}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
