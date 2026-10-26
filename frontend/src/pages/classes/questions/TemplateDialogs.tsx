import { X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import type { FormRead } from '../../../api/forms'
import {
  useApplyTemplate,
  useCreateTemplate,
  useDeleteTemplate,
  useRenameTemplate,
  useTemplates,
  type Template,
} from '../../../api/templates'
import { useCurrentUser } from '../../../auth/useCurrentUser'
import { Button, TextField } from '../../../components'
import styles from './FormBuilder.module.css'
import own from './TemplateDialogs.module.css'
import { questionTitle } from './questionTypes'

/** Sparar det som är osparat i byggaren. Svarar false om frågorna inte går att spara än. */
type Flush = () => Promise<boolean>

const NOT_SAVED = 'Frågorna behöver fyllas i innan de kan sparas. Rätta dem och försök igen.'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    // Som AddQuestionDialog: ingen close() vid avmontering, se kommentaren där.
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="template-dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className={styles.dialogInner}>
        <div className={styles.dialogHeader}>
          <h2 id="template-dialog-title" className={styles.dialogTitle}>
            {title}
          </h2>
          <button type="button" className={styles.iconButton} aria-label="Stäng" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={own.body}>{children}</div>
      </div>
    </dialog>
  )
}

function defaultName() {
  return `Frågor sparade ${new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}`
}

// --- Spara som mall ---------------------------------------------------------------------

export function SaveTemplateDialog({
  classId,
  flush,
  onSaved,
  onClose,
}: {
  classId: string
  flush: Flush
  onSaved: (name: string) => void
  onClose: () => void
}) {
  const { data: user } = useCurrentUser()
  const isAdmin = user?.role === 'school_admin'
  const create = useCreateTemplate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!(await flush())) {
      setError(NOT_SAVED)
      return
    }
    create.mutate(
      { name: name.trim(), class_id: classId },
      { onSuccess: (t) => onSaved(t.name), onError: (e) => setError(e.message) },
    )
  }

  return (
    <Modal title="Spara som mall" onClose={onClose}>
      <form className={own.form} onSubmit={submit}>
        <p className={own.lead}>
          {isAdmin
            ? 'Frågorna sparas som en mall för skolan. Alla lärare på skolan kan använda den i sina klasser.'
            : 'Frågorna sparas som din egen mall. Du kan använda den i andra klasser, till exempel nästa år. Bara du ser den.'}
        </p>
        <TextField
          label="Mallens namn"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Till exempel Veckoredovisning El och energi"
          required
          autoFocus
          maxLength={200}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={own.actions}>
          <Button onClick={onClose}>Avbryt</Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
            Spara mall
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// --- Använd mall ------------------------------------------------------------------------

export function UseTemplateDialog({
  classId,
  hasQuestions,
  flush,
  onApplied,
  onClose,
}: {
  classId: string
  hasQuestions: boolean
  flush: Flush
  onApplied: (form: FormRead, templateName: string) => void
  onClose: () => void
}) {
  const { data: user } = useCurrentUser()
  const isAdmin = user?.role === 'school_admin'
  const templates = useTemplates()
  const apply = useApplyTemplate(classId)
  const create = useCreateTemplate()
  const [chosen, setChosen] = useState<Template | null>(null)
  const [saveName, setSaveName] = useState(defaultName)
  const [error, setError] = useState<string | null>(null)

  const all = templates.data ?? []
  const school = all.filter((t) => t.scope === 'school')
  const personal = all.filter((t) => t.scope === 'personal')
  const busy = apply.isPending || create.isPending

  async function applyTemplate(template: Template, saveFirst: boolean) {
    setError(null)
    if (!(await flush())) {
      setError(NOT_SAVED)
      return
    }
    try {
      if (saveFirst) await create.mutateAsync({ name: saveName.trim(), class_id: classId })
      const form = await apply.mutateAsync(template.id)
      onApplied(form, template.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Något gick fel. Försök igen.')
    }
  }

  function pick(template: Template) {
    if (hasQuestions) setChosen(template)
    else void applyTemplate(template, false)
  }

  if (chosen) {
    return (
      <Modal title={`Använd ${chosen.name}`} onClose={onClose}>
        <form
          className={own.form}
          onSubmit={(e) => {
            e.preventDefault()
            void applyTemplate(chosen, true)
          }}
        >
          <p className={own.lead}>
            Mallen ersätter klassens frågor i utkastet. Eleverna ser inget förrän du publicerar. Vill du spara de
            nuvarande frågorna som {isAdmin ? 'en mall för skolan' : 'en egen mall'} först, så att du kan använda dem
            igen?
          </p>
          <TextField
            label="Namn på mallen med de nuvarande frågorna"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            maxLength={200}
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={own.actions}>
            <Button onClick={() => setChosen(null)} disabled={busy}>
              Tillbaka
            </Button>
            <Button onClick={() => void applyTemplate(chosen, false)} disabled={busy}>
              Använd utan att spara
            </Button>
            <Button type="submit" variant="primary" disabled={!saveName.trim() || busy}>
              Spara och använd mallen
            </Button>
          </div>
        </form>
      </Modal>
    )
  }

  return (
    <Modal title="Använd mall" onClose={onClose}>
      {templates.isPending && <p className={own.lead}>Hämtar mallar…</p>}
      {templates.isError && <p className={own.lead}>Mallarna gick inte att hämta. Försök igen.</p>}
      {templates.isSuccess && all.length === 0 && (
        <p className={own.lead}>
          Det finns inga mallar än. Spara klassens frågor med Spara som mall, så kan du använda dem i andra klasser.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {school.length > 0 && (
        <TemplateGroup title="Skolans mallar" templates={school} canEdit={isAdmin} busy={busy} onPick={pick} />
      )}
      {personal.length > 0 && (
        <TemplateGroup title="Mina mallar" templates={personal} canEdit busy={busy} onPick={pick} />
      )}
    </Modal>
  )
}

function TemplateGroup({
  title,
  templates,
  canEdit,
  busy,
  onPick,
}: {
  title: string
  templates: Template[]
  canEdit: boolean
  busy: boolean
  onPick: (template: Template) => void
}) {
  return (
    <section className={own.group} aria-label={title}>
      <h3 className={own.groupTitle}>{title}</h3>
      <ul className={own.list}>
        {templates.map((t) => (
          <TemplateItem key={t.id} template={t} canEdit={canEdit} busy={busy} onPick={() => onPick(t)} />
        ))}
      </ul>
    </section>
  )
}

function TemplateItem({
  template,
  canEdit,
  busy,
  onPick,
}: {
  template: Template
  canEdit: boolean
  busy: boolean
  onPick: () => void
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view')
  const [name, setName] = useState(template.name)
  const rename = useRenameTemplate()
  const remove = useDeleteTemplate()
  const questions = template.content.questions
  const preview = questions.slice(0, 3).map(questionTitle).join(' · ')

  if (mode === 'rename') {
    return (
      <li className={own.item}>
        <form
          className={own.renameForm}
          onSubmit={(e) => {
            e.preventDefault()
            rename.mutate({ id: template.id, name: name.trim() }, { onSuccess: () => setMode('view') })
          }}
        >
          <TextField label="Nytt namn" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
          <div className={own.itemActions}>
            <Button onClick={() => setMode('view')}>Avbryt</Button>
            <Button type="submit" variant="primary" disabled={!name.trim() || rename.isPending}>
              Spara
            </Button>
          </div>
          {rename.isError && (
            <p className={styles.error} role="alert">
              {rename.error.message}
            </p>
          )}
        </form>
      </li>
    )
  }

  return (
    <li className={own.item}>
      <span className={own.itemText}>
        <span className={own.itemName}>{template.name}</span>
        <span className={own.itemMeta}>
          {questions.length} {questions.length === 1 ? 'fråga' : 'frågor'}
          {preview && ` · ${preview}`}
        </span>
      </span>
      <span className={own.itemActions}>
        {mode === 'delete' ? (
          <>
            <span className={own.confirmText}>Ta bort mallen?</span>
            <button
              type="button"
              className={own.dangerButton}
              disabled={remove.isPending}
              onClick={() => remove.mutate(template.id)}
            >
              Ta bort
            </button>
            <button type="button" className={own.textButton} onClick={() => setMode('view')}>
              Avbryt
            </button>
          </>
        ) : (
          <>
            {canEdit && (
              <>
                <button type="button" className={own.textButton} onClick={() => setMode('rename')}>
                  Byt namn
                </button>
                <button type="button" className={own.textButton} onClick={() => setMode('delete')}>
                  Ta bort
                </button>
              </>
            )}
            <Button variant="soft" onClick={onPick} disabled={busy}>
              Använd
            </Button>
          </>
        )}
      </span>
      {remove.isError && (
        <p className={styles.error} role="alert">
          {remove.error.message}
        </p>
      )}
    </li>
  )
}
