import { Archive, ArrowUpRight, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useArchiveClass, useClasses, useDeleteClass, type ClassDetail } from '../../api/classes'
import { Button, Card } from '../../components'
import styles from './ArchiveClass.module.css'
import classStyles from './Classes.module.css'

/**
 * Arkivera och ta bort klasser (idé 8, Texas skiss "Arkivera klasser" 2026-11-08).
 *
 * En arkiverad klass går att läsa men inte ändra. Eleverna får inga nya redovisningar i den.
 * Läraren och skoladmin arkiverar och tar tillbaka. Bara en klass utan redovisningar kan tas
 * bort helt, så att elevernas arbete sparas.
 */

function archivedDate(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Knapparna överst på klassens sida. */
export function ClassActions({ cls }: { cls: ClassDetail }) {
  const [open, setOpen] = useState<'archive' | 'delete' | null>(null)
  if (cls.archived_at) return null
  return (
    <div className={styles.actions}>
      <Button icon={<Archive aria-hidden="true" />} onClick={() => setOpen('archive')}>
        Arkivera klass
      </Button>
      {cls.report_count === 0 && (
        <Button icon={<Trash2 aria-hidden="true" />} onClick={() => setOpen('delete')}>
          Ta bort
        </Button>
      )}
      {open === 'archive' && <ArchiveDialog cls={cls} onClose={() => setOpen(null)} />}
      {open === 'delete' && <DeleteDialog cls={cls} onClose={() => setOpen(null)} />}
    </div>
  )
}

function useDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = ref.current
    if (node && !node.open) node.showModal()
  }, [])
  return ref
}

function ArchiveDialog({ cls, onClose }: { cls: ClassDetail; onClose: () => void }) {
  const ref = useDialog()
  const archive = useArchiveClass(cls.id)
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="archive-title">
      <div className={styles.frame}>
        <h2 id="archive-title" className={styles.title}>
          Arkivera {cls.name}?
        </h2>
        <p className={styles.text}>
          Klassen flyttas till Arkiverade. Du kan fortfarande läsa redovisningar, närvaro, projekt och kontrakt, men
          inget går att ändra.
        </p>
        <div className={styles.facts}>
          <strong>Det här händer</strong>
          <ul>
            <li>Eleverna får inga nya redovisningar i klassen.</li>
            <li>Klassen syns inte i Översikt och Närvaro.</li>
            <li>Elevkontona finns kvar.</li>
          </ul>
        </div>
        <p className={styles.hint}>Du kan ta tillbaka klassen när som helst.</p>
        {archive.isError && <p className={styles.error}>Det gick inte att arkivera klassen. Försök igen.</p>}
        <div className={styles.buttons}>
          <Button onClick={() => ref.current?.close()}>Avbryt</Button>
          <Button
            variant="primary"
            icon={<Archive aria-hidden="true" />}
            disabled={archive.isPending}
            onClick={() => archive.mutate(true, { onSuccess: () => ref.current?.close() })}
          >
            Arkivera
          </Button>
        </div>
      </div>
    </dialog>
  )
}

function DeleteDialog({ cls, onClose }: { cls: ClassDetail; onClose: () => void }) {
  const ref = useDialog()
  const remove = useDeleteClass(cls.id)
  const navigate = useNavigate()
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="delete-title">
      <div className={styles.frame}>
        <h2 id="delete-title" className={styles.title}>
          Ta bort {cls.name}?
        </h2>
        <p className={styles.text}>
          Klassen har inga redovisningar än, så den kan tas bort helt. Eleverna tas bort ur klassen men elevkontona
          finns kvar.
        </p>
        {remove.isError && <p className={styles.error}>Det gick inte att ta bort klassen. Försök igen.</p>}
        <div className={styles.buttons}>
          <Button onClick={() => ref.current?.close()}>Avbryt</Button>
          <button
            type="button"
            className={styles.danger}
            disabled={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })}
          >
            <Trash2 aria-hidden="true" /> Ta bort klassen
          </button>
        </div>
        <p className={styles.note}>Har klassen redovisningar går den bara att arkivera. Då sparas elevernas arbete.</p>
      </div>
    </dialog>
  )
}

/** Gul ruta överst på en arkiverad klass, med Ta tillbaka. */
export function ArchivedBanner({ cls, canRestore }: { cls: ClassDetail; canRestore: boolean }) {
  const restore = useArchiveClass(cls.id)
  if (!cls.archived_at) return null
  return (
    <div className={styles.banner} role="status">
      <Archive aria-hidden="true" className={styles.bannerIcon} />
      <span className={styles.bannerText}>
        <strong>Arkiverad {archivedDate(cls.archived_at)}</strong>
        <span>Du kan läsa allt i klassen, men inget går att ändra.</span>
      </span>
      {canRestore && (
        <Button icon={<Undo2 aria-hidden="true" />} disabled={restore.isPending} onClick={() => restore.mutate(false)}>
          Ta tillbaka klassen
        </Button>
      )}
    </div>
  )
}

/** Lärarens arkiverade klasser, från länken Arkiverade i menyn. */
export function ArchivedClasses() {
  const classes = useClasses()
  const archived = (classes.data ?? []).filter((c) => c.archived_at)
  return (
    <div className={classStyles.page}>
      <header className={classStyles.header}>
        <h1 className={classStyles.title}>Arkiverade klasser</h1>
        <p className={classStyles.subtitle}>Klasser som är klara. Du kan läsa allt men inte ändra något.</p>
      </header>
      <Card>
        {classes.isPending ? (
          <p className={classStyles.empty}>Laddar klasser…</p>
        ) : archived.length === 0 ? (
          <p className={classStyles.empty}>Inga arkiverade klasser.</p>
        ) : (
          <ArchivedList classes={archived} />
        )}
      </Card>
    </div>
  )
}

type Summary = NonNullable<ReturnType<typeof useClasses>['data']>[number]

export function ArchivedList({ classes }: { classes: Summary[] }) {
  return (
    <ul className={classStyles.list}>
      {classes.map((cls) => (
        <li key={cls.id}>
          <Link to={`/classes/${cls.id}`} className={`${classStyles.row} ${classStyles.rowLink}`}>
            <span className={styles.rowIcon} aria-hidden="true">
              <Archive />
            </span>
            <span className={classStyles.rowText}>
              <span className={classStyles.name}>{cls.name}</span>
              <span className={classStyles.meta}>
                {cls.student_count} elever · Arkiverad {cls.archived_at && archivedDate(cls.archived_at)}
              </span>
            </span>
            <ArrowUpRight aria-hidden="true" style={{ marginLeft: 'auto', width: 20, height: 20 }} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
