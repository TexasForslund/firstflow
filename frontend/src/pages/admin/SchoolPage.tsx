import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'

import { useCreateSchoolAdmin, useSchoolUsers, useSchools } from '../../api/schools'
import { roleLabel } from '../../auth/roles'
import { Avatar, Button, Card, TextField } from '../../components'
import styles from '../classes/Classes.module.css'
import { NotFound } from '../NotFound'

/** En skola för superadmin: skolans administratörer och antal konton per roll. */
export function SchoolPage() {
  const { schoolId = '' } = useParams()
  const schools = useSchools()
  const users = useSchoolUsers(schoolId)

  if (schools.isPending) return <p className={styles.state}>Laddar skolan…</p>
  const school = schools.data?.find((s) => s.id === schoolId)
  if (!school) return <NotFound what="Skolan" />

  const all = users.data ?? []
  const admins = all.filter((u) => u.role === 'school_admin')
  const counts = (['principal', 'syv', 'teacher', 'student'] as const).map((role) => ({
    role,
    count: all.filter((u) => u.role === role).length,
  }))

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{school.name}</h1>
        <p className={styles.subtitle}>
          {school.org_number ? `Org.nr ${school.org_number}` : 'Inget organisationsnummer'}
          {!school.is_active && ' · Avstängd'}
        </p>
      </header>

      <Card>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Skoladministratörer</h2>
          <span className={styles.count}>{admins.length}</span>
        </div>
        {users.isPending ? (
          <p className={styles.empty}>Laddar…</p>
        ) : admins.length === 0 ? (
          <p className={styles.empty}>Skolan har ingen administratör än. Lägg till en nedan.</p>
        ) : (
          <ul className={styles.list}>
            {admins.map((admin) => (
              <li key={admin.id} className={styles.row}>
                <span className={styles.rowLink}>
                  <Avatar name={admin.name} />
                  <span className={styles.rowText}>
                    <span className={styles.name}>{admin.name}</span>
                    <span className={styles.meta}>{admin.email}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CreateAdminForm schoolId={school.id} />

      <Card>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Konton på skolan</h2>
        </div>
        <dl className={styles.terms}>
          {counts.map(({ role, count }) => (
            <div key={role}>
              <dt>{roleLabel[role]}</dt>
              <dd>{count}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}

function CreateAdminForm({ schoolId }: { schoolId: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const create = useCreateSchoolAdmin(schoolId)

  function submit(event: FormEvent) {
    event.preventDefault()
    setCreated(null)
    create.mutate(
      { name, email },
      {
        onSuccess: (admin) => {
          setCreated(`${admin.name} är skoladministratör.`)
          setName('')
          setEmail('')
        },
      },
    )
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Lägg till skoladministratör</h2>
      </div>
      <div className={styles.cardBody}>
        <form className={styles.form} onSubmit={submit}>
          <TextField label="Namn" required value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="E-post" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
              {created}
            </p>
          )}
        </form>
        <p className={styles.hint}>
          Administratören lägger sedan in skolans personal, klasser och elever. Kontot kan logga in när inbjudningar
          finns.
        </p>
      </div>
    </Card>
  )
}
