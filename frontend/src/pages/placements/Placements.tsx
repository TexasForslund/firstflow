import { MapPin, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { ApiError } from '../../api/errors'
import { useAddSupervisor, useCreateWorkplace, useWorkplaces, type Workplace } from '../../api/placements'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, Card, TextField } from '../../components'
import styles from '../classes/Classes.module.css'
import own from './Placements.module.css'

/** Skolans arbetsplatser med handledare. Lärare och skoladmin lägger till, rektor ser. */
export function Placements() {
  const { data: user } = useCurrentUser()
  const query = useWorkplaces()
  const canEdit = user?.role === 'teacher' || user?.role === 'school_admin'
  const workplaces = query.data ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Praktikplatser</h1>
        <p className={styles.subtitle}>
          Skolans arbetsplatser och handledare. Eleverna placeras på en arbetsplats från klassvyn.
        </p>
      </header>

      {query.isPending && <p className={styles.state}>Laddar arbetsplatser…</p>}
      {query.isError && <p className={styles.state}>Arbetsplatserna gick inte att hämta. Ladda om sidan.</p>}

      {query.isSuccess && workplaces.length === 0 && (
        <Card>
          <p className={styles.empty}>
            Skolan har inga arbetsplatser än.
            {canEdit && ' Lägg till den första nedan.'}
          </p>
        </Card>
      )}

      {workplaces.map((workplace) => (
        <WorkplaceCard key={workplace.id} workplace={workplace} canEdit={canEdit} />
      ))}

      {canEdit && <NewWorkplaceForm />}
    </div>
  )
}

function WorkplaceCard({ workplace, canEdit }: { workplace: Workplace; canEdit: boolean }) {
  const [adding, setAdding] = useState(false)
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div className={own.heading}>
          <h2 className={styles.cardTitle}>{workplace.name}</h2>
          {workplace.address && (
            <span className={own.address}>
              <MapPin aria-hidden="true" />
              {workplace.address}
            </span>
          )}
        </div>
        <span className={styles.count}>{workplace.supervisors.length} handledare</span>
      </div>
      {workplace.supervisors.length === 0 ? (
        <p className={styles.empty}>Ingen handledare än. En elev kan placeras här när det finns en handledare.</p>
      ) : (
        <ul className={styles.list}>
          {workplace.supervisors.map((s) => (
            <li key={s.id} className={styles.row}>
              <span className={styles.rowLink}>
                <Avatar name={s.name} />
                <span className={styles.rowText}>
                  <span className={styles.name}>{s.name}</span>
                  <span className={styles.meta}>{s.email}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className={own.footer}>
          {adding ? (
            <AddSupervisorForm workplace={workplace} onDone={() => setAdding(false)} />
          ) : (
            <Button icon={<Plus aria-hidden="true" />} onClick={() => setAdding(true)}>
              Lägg till handledare
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

function AddSupervisorForm({ workplace, onDone }: { workplace: Workplace; onDone: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const add = useAddSupervisor(workplace.id)

  function submit(event: FormEvent) {
    event.preventDefault()
    add.mutate({ name: name.trim(), email: email.trim() }, { onSuccess: onDone })
  }

  return (
    <form className={`${styles.form} ${own.supervisorForm}`} onSubmit={submit} aria-label={`Ny handledare på ${workplace.name}`}>
      <TextField label="Namn" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      <TextField label="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <span className={own.formButtons}>
        <Button type="submit" variant="primary" disabled={add.isPending}>
          Lägg till
        </Button>
        <button type="button" className={styles.textButton} onClick={onDone}>
          Avbryt
        </button>
      </span>
      {add.isError && (
        <p className={styles.formError} role="alert">
          {add.error instanceof ApiError && add.error.status === 409
            ? 'E-postadressen används redan av någon som inte är handledare.'
            : add.error.message}
        </p>
      )}
      <p className={`${styles.hint} ${own.fullRow}`}>
        Finns handledaren redan i Firstflow kopplas hen hit. Annars skapas ett konto, och lösenordet sätts via en
        inbjudan.
      </p>
    </form>
  )
}

function NewWorkplaceForm() {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const create = useCreateWorkplace()

  function submit(event: FormEvent) {
    event.preventDefault()
    setCreated(null)
    create.mutate(
      { name: name.trim(), address: address.trim() || null },
      {
        onSuccess: (workplace) => {
          setCreated(workplace.name)
          setName('')
          setAddress('')
        },
      },
    )
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Ny arbetsplats</h2>
      </div>
      <div className={styles.cardBody}>
        <form className={styles.form} onSubmit={submit}>
          <TextField label="Namn" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField label="Adress (valfri)" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Button type="submit" variant="primary" disabled={create.isPending}>
            Lägg till
          </Button>
          {create.isError && (
            <p className={styles.formError} role="alert">
              {create.error.message}
            </p>
          )}
          {created && (
            <p className={styles.formSuccess} role="status">
              {created} är tillagd. Lägg till en handledare på arbetsplatsen ovan.
            </p>
          )}
        </form>
      </div>
    </Card>
  )
}
