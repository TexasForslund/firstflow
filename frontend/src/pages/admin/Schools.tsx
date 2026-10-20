import { ArrowUpRight, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { useCreateSchool, useSchools } from '../../api/schools'
import { Button, Card, TextField } from '../../components'
import styles from '../classes/Classes.module.css'

/** Alla skolor i Firstflow. Superadmin skapar nya skolor här. */
export function Schools() {
  const schools = useSchools()
  const [adding, setAdding] = useState(false)

  return (
    <div className={styles.page}>
      <div className={styles.titleRow}>
        <header className={styles.header}>
          <h1 className={styles.title}>Skolor</h1>
          <p className={styles.subtitle}>Alla skolor i Firstflow</p>
        </header>
        {!adding && (
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setAdding(true)}>
            Ny skola
          </Button>
        )}
      </div>

      {adding && <CreateSchoolForm onDone={() => setAdding(false)} />}

      <Card>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Skolor</h2>
          <span className={styles.count}>{schools.data?.length ?? ''}</span>
        </div>
        {schools.isPending ? (
          <p className={styles.empty}>Laddar skolor…</p>
        ) : schools.isError ? (
          <p className={styles.empty}>Det gick inte att hämta skolorna. Ladda om sidan.</p>
        ) : schools.data.length === 0 ? (
          <p className={styles.empty}>Det finns inga skolor än. Skapa den första.</p>
        ) : (
          <ul className={styles.list}>
            {schools.data.map((school) => (
              <li key={school.id}>
                <Link to={`/admin/schools/${school.id}`} className={`${styles.row} ${styles.rowLink}`}>
                  <span className={styles.rowText}>
                    <span className={styles.name}>{school.name}</span>
                    <span className={styles.meta}>
                      {school.org_number ? `Org.nr ${school.org_number}` : 'Inget organisationsnummer'}
                      {!school.is_active && ' · Avstängd'}
                    </span>
                  </span>
                  <ArrowUpRight aria-hidden="true" style={{ marginLeft: 'auto', width: 20, height: 20 }} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function CreateSchoolForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [orgNumber, setOrgNumber] = useState('')
  const create = useCreateSchool()

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate(
      { name, org_number: orgNumber.trim() || null },
      { onSuccess: (school) => navigate(`/admin/schools/${school.id}`) },
    )
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Ny skola</h2>
      </div>
      <div className={styles.cardBody}>
        <form className={styles.formSingle} style={{ maxWidth: 'none' }} onSubmit={submit}>
          {create.isError && (
            <p className={styles.formError} role="alert" style={{ marginTop: 0 }}>
              {create.error.message}
            </p>
          )}
          <div className={styles.formGrid}>
            <TextField label="Skolans namn" required value={name} onChange={(e) => setName(e.target.value)} />
            <TextField
              label="Organisationsnummer (valfritt)"
              placeholder="212000-0456"
              maxLength={20}
              value={orgNumber}
              onChange={(e) => setOrgNumber(e.target.value)}
            />
          </div>
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={create.isPending || !name.trim()}>
              Skapa skola
            </Button>
            <Button onClick={onDone}>Avbryt</Button>
          </div>
          <p className={styles.hint}>Nästa steg är att lägga till skolans administratör.</p>
        </form>
      </div>
    </Card>
  )
}
