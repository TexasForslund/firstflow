import { GraduationCap, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { useSchoolTeachers } from '../../api/classes'
import { useSetTeachers, useStudent, type Student } from '../../api/students'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, Card, Tag } from '../../components'
import styles from '../classes/Classes.module.css'
import { NotFound } from '../NotFound'
import { CheckList } from './CheckList'

export function StudentPage() {
  const { studentId = '' } = useParams()
  const { data: user } = useCurrentUser()
  const query = useStudent(studentId)

  if (query.isPending) return <p className={styles.state}>Laddar eleven…</p>
  if (query.isError) return <NotFound what="Eleven" />

  const student = query.data
  const isAdmin = user?.role === 'school_admin'

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

      {isAdmin ? (
        <TeachersEditor student={student} schoolId={user?.school_id} />
      ) : (
        <Card>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Lärare</h2>
          </div>
          <div className={styles.cardBody}>
            {student.teachers.length === 0 ? (
              <p className={styles.hint}>Eleven har ingen lärare kopplad.</p>
            ) : (
              <div className={styles.tags}>
                {student.teachers.map((t) => (
                  <Tag key={t.id} icon={<GraduationCap aria-hidden="true" />}>
                    {t.name}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>APL och närvaro</h2>
        </div>
        <p className={styles.empty}>Praktikplats, period och närvaro visas här när de är byggda (F4 och F5).</p>
      </Card>
    </div>
  )
}

function TeachersEditor({ student, schoolId }: { student: Student; schoolId?: string | null }) {
  const saved = student.teachers.map((t) => t.id)
  const [selected, setSelected] = useState<string[]>(saved)
  const [done, setDone] = useState(false)
  const teachers = useSchoolTeachers(schoolId, true)
  const setTeachers = useSetTeachers(student.id)
  const changed = selected.length !== saved.length || selected.some((id) => !saved.includes(id))

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Lärare</h2>
        <span className={styles.count}>{student.teachers.length}</span>
      </div>
      <div className={styles.cardBody} style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <CheckList
          legend="Lärare som ser eleven och kan lägga hen i sina klasser"
          options={(teachers.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
          selected={selected}
          onChange={(next) => {
            setSelected(next)
            setDone(false)
          }}
          emptyText={teachers.isPending ? 'Hämtar lärare…' : 'Skolan har inga lärare än.'}
        />
        {setTeachers.isError && (
          <p className={styles.formError} role="alert" style={{ marginTop: 0 }}>
            {setTeachers.error.message}
          </p>
        )}
        <div className={styles.formActions} style={{ alignItems: 'center' }}>
          <Button
            variant="primary"
            disabled={!changed || setTeachers.isPending}
            onClick={() => setTeachers.mutate(selected, { onSuccess: () => setDone(true) })}
          >
            Spara lärare
          </Button>
          {done && !changed && (
            <span className={styles.formSuccess} role="status" style={{ marginTop: 0 }}>
              Sparat.
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
