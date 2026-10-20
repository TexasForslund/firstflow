import { Users } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { useStudent } from '../../api/classes'
import { Avatar, Card, Tag } from '../../components'
import styles from '../classes/Classes.module.css'
import { NotFound } from '../NotFound'

export function StudentPage() {
  const { studentId = '' } = useParams()
  const query = useStudent(studentId)

  if (query.isPending) return <p className={styles.state}>Laddar eleven…</p>
  if (query.isError) return <NotFound what="Eleven" />

  const student = query.data
  return (
    <div className={styles.page}>
      <header className={styles.titleRow} style={{ justifyContent: 'flex-start' }}>
        <Avatar name={student.name} size="lg" />
        <div className={styles.header}>
          <h1 className={styles.title}>{student.name}</h1>
          <p className={styles.subtitle}>
            {student.email}
            {student.school_name ? ` · ${student.school_name}` : ''}
          </p>
        </div>
      </header>

      <Card>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Klasser</h2>
        </div>
        <div className={styles.cardBody}>
          {student.classes.length === 0 ? (
            <p className={styles.hint}>Eleven går inte i någon klass.</p>
          ) : (
            <div className={styles.tags}>
              {student.classes.map((cls) => (
                <Link key={cls.id} to={`/classes/${cls.id}`} className={styles.tagLink}>
                  <Tag icon={<Users aria-hidden="true" />}>{cls.name}</Tag>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>APL och närvaro</h2>
        </div>
        <p className={styles.empty}>Praktikplats, period och närvaro visas här när de är byggda (F4 och F5).</p>
      </Card>
    </div>
  )
}
