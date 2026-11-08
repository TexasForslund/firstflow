import {
  BookmarkPlus,
  ChevronDown,
  CircleCheck,
  Eye,
  LayoutTemplate,
  LoaderCircle,
  Plus,
  Sparkles,
  Undo2,
} from 'lucide-react'
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
import { useGoals } from '../../../api/goals'
import { useClassTracks } from '../../../api/tracks'
import styles from './FormBuilder.module.css'
import { PhonePreview } from './PhonePreview'
import { Suggestions } from './Suggestions'
import { QuestionCards } from './QuestionCards'
import cardStyles from './QuestionCards.module.css'
import { SaveTemplateDialog, UseTemplateDialog } from './TemplateDialogs'
import {
  convertJump,
  duplicateQuestion,
  flatten,
  jumpAsFollowUps,
  groupQuestions,
  type Group,
  newQuestion,
  QUESTION_TYPES,
  questionProblems,
  questionTitle,
  sanitizeLogic,
  unusedGoals,
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
  const goals = useGoals(true, classId).data ?? []

  const [questions, setQuestions] = useState(initial)
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  // Förslagen från målen visas först när klassen har mål men inga frågor (Texas, 2026-11-08).
  const [suggesting, setSuggesting] = useState(initial.length === 0)
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
    publish.reset()
  }

  function updateQuestion(question: Question) {
    update(questions.map((q) => (q.id === question.id ? question : q)))
  }

  const groups = groupQuestions(questions)

  /** Platsen efter den valda frågan och dess följdfrågor, annars sist. */
  function insertAt() {
    const group = groups.find((g) => g.question.id === selectedId)
    if (!group) return questions.length
    const last = group.followUps.at(-1) ?? group.question
    return questions.findIndex((q) => q.id === last.id) + 1
  }

  function addQuestion(type: QuestionType) {
    const question = newQuestion(type)
    const next = [...questions]
    next.splice(insertAt(), 0, question)
    update(next)
    setSelectedId(question.id)
    setFocusId(question.id)
    setAdding(false)
  }

  /** Färdiga frågor från ett mål (idé 13, steg 5). Läggs efter den valda frågan. */
  function addQuestions(build: (nextId: string | null) => Question[]) {
    const at = insertAt()
    const added = build(questions[at]?.id ?? null)
    const next = [...questions]
    next.splice(at, 0, ...added)
    update(next)
    setSelectedId(added[0].id)
    setAdding(false)
  }

  /** Frågor från förslagen. Läggs sist, i den ordning läraren väljer dem. */
  function appendQuestions(added: Question[]) {
    update([...questions, ...added])
    setSelectedId(added[0].id)
  }

  /** En följdfråga om ett svar, sist bland frågans följdfrågor (Texas, 2026-11-08). */
  function addFollowUp(parentId: string, when: string) {
    const group = groups.find((g) => g.question.id === parentId)!
    const last = group.followUps.at(-1) ?? group.question
    const followUp = { ...newQuestion('long_text'), show_if: { question_id: parentId, when } }
    const next = [...questions]
    next.splice(questions.findIndex((q) => q.id === last.id) + 1, 0, followUp)
    update(next)
  }

  /** Tar bort frågan. En fråga tas bort med sina följdfrågor. */
  function remove(id: string) {
    const index = groups.findIndex((g) => g.question.id === id)
    if (index < 0) {
      update(questions.filter((q) => q.id !== id))
      return
    }
    const rest = groups.filter((_, i) => i !== index)
    update(flatten(rest))
    setSelectedId(rest[Math.min(index, rest.length - 1)]?.question.id ?? null)
  }

  /** Kopia av frågan och dess följdfrågor, direkt efter. */
  function duplicate(id: string) {
    const index = groups.findIndex((g) => g.question.id === id)
    const group = groups[index]
    const copy = duplicateQuestion(group.question)
    // Följdfrågorna följer med och pekar på kopian och kopians alternativ.
    const choiceIds = new Map<string, string>()
    if (group.question.type === 'choice' && copy.type === 'choice') {
      group.question.choices.forEach((c, i) => choiceIds.set(c.id, copy.choices[i].id))
      copy.goals = group.question.goals.map((g) => ({ ...g, when: choiceIds.get(g.when) ?? g.when }))
    }
    const followUps = group.followUps.map((f) => ({
      ...duplicateQuestion(f),
      show_if: { question_id: copy.id, when: choiceIds.get(f.show_if!.when) ?? f.show_if!.when },
    }))
    const next: Group[] = [...groups]
    next.splice(index + 1, 0, { question: copy, followUps })
    update(flatten(next))
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

  const selectedGroup = groups.find((g) => g.question.id === selectedId) ?? null
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
          <div className={cardStyles.more}>
            <Button
              icon={<ChevronDown aria-hidden="true" />}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(!moreOpen)}
            >
              Mer
            </Button>
            {moreOpen && (
              <div className={cardStyles.moreMenu} role="group" aria-label="Mer">
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    setTemplateDialog('use')
                  }}
                >
                  <LayoutTemplate aria-hidden="true" /> Använd mall
                </button>
                <button
                  type="button"
                  disabled={questions.length === 0}
                  onClick={() => {
                    setMoreOpen(false)
                    setTemplateDialog('save')
                  }}
                >
                  <BookmarkPlus aria-hidden="true" /> Spara som mall
                </button>
                {meta.published_version && hasChanges && (
                  <button
                    type="button"
                    disabled={discard.isPending}
                    onClick={() => {
                      setMoreOpen(false)
                      setConfirmDiscard(true)
                    }}
                  >
                    <Undo2 aria-hidden="true" /> Kasta ändringar
                  </button>
                )}
              </div>
            )}
          </div>
          {confirmDiscard && (
            <span className={styles.confirm} role="group" aria-label="Bekräfta">
              <span>Ta bort alla ändringar sedan publiceringen?</span>
              <Button onClick={discardNow}>Ja, kasta</Button>
              <Button onClick={() => setConfirmDiscard(false)}>Avbryt</Button>
            </span>
          )}
          <Button
            icon={<Eye aria-hidden="true" />}
            onClick={() => setPreviewing(true)}
            disabled={questions.length === 0 || !valid}
          >
            Förhandsgranska
          </Button>
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

      {suggesting && goals.some((g) => g.class_id) ? (
        <Suggestions questions={questions} goals={goals} onAdd={appendQuestions} onClose={() => setSuggesting(false)} />
      ) : groups.length === 0 ? (
        <section className={`${styles.canvas} ${styles.emptyCanvas}`}>
          <h2 className={styles.emptyTitle}>Inga frågor än</h2>
          <p className={styles.settingsHint}>
            Eleverna svarar på frågorna vid varje redovisning. Börja med en fritextfråga, till exempel "Vad har du gjort
            i dag?", eller välj färdiga frågor från klassens mål.
          </p>
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setAdding(true)}>
            Lägg till fråga
          </Button>
        </section>
      ) : (
        <div className={cardStyles.layout}>
          <div className={cardStyles.column}>
            <QuestionCards
              groups={groups}
              selectedId={selectedId}
              focusId={focusId}
              goals={goals}
              tracks={tracks}
              onSelect={(id) => {
                setSelectedId(id)
                setFocusId(null)
              }}
              onChange={updateQuestion}
              onReorder={(next) => update(flatten(next))}
              onAddFollowUp={addFollowUp}
              onRemove={remove}
              onDuplicate={duplicate}
              canConvertJump={(id) => jumpAsFollowUps(questions, id) !== null}
              onConvertJump={(id) => update(convertJump(questions, id))}
            />
            <div className={cardStyles.addRow}>
              <button type="button" className={cardStyles.addQuestion} onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" /> Lägg till fråga
              </button>
              {unusedGoals(questions, goals).length > 0 && (
                <button type="button" className={cardStyles.suggest} onClick={() => setSuggesting(true)}>
                  <Sparkles aria-hidden="true" /> Förslag från målen ({unusedGoals(questions, goals).length} kvar)
                </button>
              )}
            </div>
          </div>
          {selectedGroup && (
            <PhonePreview
              question={selectedGroup.question}
              followUps={selectedGroup.followUps}
              number={groups.indexOf(selectedGroup) + 1}
              total={groups.length}
            />
          )}
        </div>
      )}

      {adding && (
        <AddQuestionDialog
          goals={goals}
          onPick={addQuestion}
          onAddMany={addQuestions}
          onClose={() => setAdding(false)}
        />
      )}
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
