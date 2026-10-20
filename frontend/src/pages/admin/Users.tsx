import { Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'

import { useCreateStaff, useSchoolUsers, type SchoolUser, type StaffRole } from '../../api/schools'
import { roleLabel, type Role } from '../../auth/roles'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, Card, SelectField, TextField } from '../../components'
import styles from '../classes/Classes.module.css'

// Personalroller i den ordning de visas. Elever finns under Elever.
const STAFF_ROLES: Role[] = ['school_admin', 'principal', 'syv', 'teacher']
const CREATABLE: StaffRole[] = ['teacher', 'principal', 'syv']

type Filter = 'all' | Role

/** Skolans personal. Skoladmin lägger till lärare, rektor och SYV. Rektor läser. */
export function Users() {
  const { data: user } = useCurrentUser()
  const users = useSchoolUsers(user?.school_id)
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const canCreate = user?.role === 'school_admin'

  const staff = useMemo(
    () =>
      (users.data ?? [])
        .filter((u) => STAFF_ROLES.includes(u.role))
        .sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role) || a.name.localeCompare(b.name, 'sv')),
    [users.data],
  )
  const shown = filter === 'all' ? staff : staff.filter((u) => u.role === filter)
  const count = (role: Role) => staff.filter((u) => u.role === role).length

  return (
    <div className={styles.page}>
      <div className={styles.titleRow}>
        <header className={styles.header}>
          <h1 className={styles.title}>Användare</h1>
          <p className={styles.subtitle}>{user?.school_name}</p>
        </header>
        {canCreate && !adding && (
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setAdding(true)}>
            Lägg till personal
          </Button>
        )}
      </div>

      {canCreate && adding && user?.school_id && (
        <CreateStaffForm schoolId={user.school_id} onDone={() => setAdding(false)} />
      )}

      <div className={styles.tabs} role="tablist" aria-label="Filtrera på roll">
        {(['all', ...STAFF_ROLES] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={`${styles.tab} ${filter === f ? styles.tabActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Alla' : plural(f)}
            <span className={styles.tabCount}>{f === 'all' ? staff.length : count(f)}</span>
          </button>
        ))}
      </div>

      <Card>
        {users.isPending ? (
          <p className={styles.empty}>Laddar personal…</p>
        ) : users.isError ? (
          <p className={styles.empty}>Det gick inte att hämta personalen. Ladda om sidan.</p>
        ) : shown.length === 0 ? (
          <p className={styles.empty}>Ingen personal med den rollen än.</p>
        ) : (
          <ul className={styles.list}>
            {shown.map((person) => (
              <StaffRow key={person.id} person={person} isMe={person.id === user?.id} />
            ))}
          </ul>
        )}
      </Card>
      <p className={styles.hint}>
        Elever läggs in under Elever. Nya konton kan logga in när inbjudningar finns: då får personen en länk och
        väljer sitt lösenord.
      </p>
    </div>
  )
}

function plural(role: Role) {
  return { school_admin: 'Skoladmin', principal: 'Rektorer', syv: 'SYV', teacher: 'Lärare' }[role as string] ?? roleLabel[role]
}

function StaffRow({ person, isMe }: { person: SchoolUser; isMe: boolean }) {
  return (
    <li className={styles.row}>
      <span className={styles.rowLink}>
        <Avatar name={person.name} />
        <span className={styles.rowText}>
          <span className={styles.name}>
            {person.name}
            {isMe && <span className={styles.meta}> (du)</span>}
          </span>
          <span className={styles.meta}>{person.email}</span>
        </span>
      </span>
      <span className={styles.roleChip}>{roleLabel[person.role]}</span>
    </li>
  )
}

function CreateStaffForm({ schoolId, onDone }: { schoolId: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('teacher')
  const [created, setCreated] = useState<string | null>(null)
  const create = useCreateStaff(schoolId)

  function submit(event: FormEvent) {
    event.preventDefault()
    setCreated(null)
    create.mutate(
      { name, email, role },
      {
        onSuccess: (person) => {
          setCreated(`${person.name} är tillagd som ${roleLabel[person.role].toLowerCase()}.`)
          setName('')
          setEmail('')
        },
      },
    )
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Lägg till personal</h2>
      </div>
      <div className={styles.cardBody}>
        <form className={styles.formSingle} style={{ maxWidth: 'none' }} onSubmit={submit}>
          {create.isError && (
            <p className={styles.formError} role="alert" style={{ marginTop: 0 }}>
              {create.error.message}
            </p>
          )}
          {created && (
            <p className={styles.formSuccess} role="status" style={{ marginTop: 0 }}>
              {created}
            </p>
          )}
          <div className={styles.formGrid}>
            <TextField label="Namn" name="name" required value={name} onChange={(e) => setName(e.target.value)} />
            <TextField
              label="E-post"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div style={{ maxWidth: '20rem' }}>
            <SelectField label="Roll" value={role} onChange={(v) => setRole(v as StaffRole)}>
              {CREATABLE.map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </SelectField>
          </div>
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              Lägg till
            </Button>
            <Button onClick={onDone}>Stäng</Button>
          </div>
        </form>
      </div>
    </Card>
  )
}
