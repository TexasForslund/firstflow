import { ArrowUpRight, Plus } from 'lucide-react'
import { Link } from 'react-router'

import { useClasses } from '../../api/classes'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { ButtonLink, Card } from '../../components'
import styles from './Classes.module.css'

/** Skolans alla klasser, för skoladmin och rektor. */
export function ClassList() {
  const { data: user } = useCurrentUser()
  const classes = useClasses()
  const canCreate = user?.role === 'school_admin'

  return (
    <div className={styles.page}>
      <div className={styles.titleRow}>
        <header className={styles.header}>
          <h1 className={styles.title}>Klasser</h1>
          {user?.school_name && <p className={styles.subtitle}>{user.school_name}</p>}
        </header>
        {canCreate && (
          <ButtonLink to="/classes/new" variant="primary" icon={<Plus aria-hidden="true" />}>
            Skapa klass
          </ButtonLink>
        )}
      </div>
      <Card>
        {classes.isPending ? (
          <p className={styles.empty}>Laddar klasser…</p>
        ) : classes.isError ? (
          <p className={styles.empty}>Det gick inte att hämta klasserna. Ladda om sidan.</p>
        ) : classes.data.length === 0 ? (
          <p className={styles.empty}>Skolan har inga klasser än.</p>
        ) : (
          <ul className={styles.list}>
            {classes.data.map((cls) => (
              <li key={cls.id}>
                <Link to={`/classes/${cls.id}`} className={`${styles.row} ${styles.rowLink}`}>
                  <span className={styles.rowText}>
                    <span className={styles.name}>{cls.name}</span>
                    <span className={styles.meta}>
                      {cls.student_count} elever · {cls.teacher_names.join(', ') || 'Ingen lärare kopplad'}
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
