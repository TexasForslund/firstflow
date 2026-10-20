import { ChevronDown, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'

import {
  useAddStudent,
  useAssignTeacher,
  useClass,
  useRemoveStudent,
  useSchoolTeachers,
  useUnassignTeacher,
  type Person,
} from '../../api/classes'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, Card, TextField } from '../../components'
import { NotFound } from '../NotFound'
import styles from './Classes.module.css'

export function ClassPage() {
  const { classId = '' } = useParams()
  const { data: user } = useCurrentUser()
  const query = useClass(classId)

  if (query.isPending) return <p className={styles.state}>Laddar klassen…</p>
  if (query.isError) return <NotFound what="Klassen" />

  const cls = query.data
  const canEdit = user?.role === 'teacher' || user?.role === 'school_admin'
  const canAssignTeachers = user?.role === 'school_admin'
  const teacherNames = cls.teachers.map((t) => t.name).join(', ')

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{cls.name}</h1>
        <p className={styles.subtitle}>
          {cls.students.length} {cls.students.length === 1 ? 'elev' : 'elever'}
          {teacherNames ? ` · ${teacherNames}` : ' · Ingen lärare kopplad'}
        </p>
      </header>

      <Card>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Elever</h2>
          <span className={styles.count}>{cls.students.length}</span>
        </div>
        {cls.students.length === 0 ? (
          <p className={styles.empty}>Inga elever i klassen än.{canEdit && ' Lägg till den första nedan.'}</p>
        ) : (
          <ul className={styles.list}>
            {cls.students.map((student) => (
              <StudentRow key={student.id} classId={cls.id} student={student} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </Card>

      {canEdit && <AddStudentForm classId={cls.id} />}
      {canAssignTeachers && <TeachersCard classId={cls.id} teachers={cls.teachers} schoolId={cls.school_id} />}
    </div>
  )
}

function StudentRow({ classId, student, canEdit }: { classId: string; student: Person; canEdit: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const remove = useRemoveStudent(classId)
  return (
    <li className={styles.row}>
      <Link to={`/students/${student.id}`} className={styles.rowLink}>
        <Avatar name={student.name} />
        <span className={styles.rowText}>
          <span className={styles.name}>{student.name}</span>
          <span className={styles.meta}>{student.email}</span>
        </span>
      </Link>
      {canEdit && (
        <span className={styles.rowActions}>
          {confirming ? (
            <>
              <span className={styles.confirmText}>Ta bort ur klassen?</span>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={remove.isPending}
                onClick={() => remove.mutate(student.id)}
              >
                Ta bort
              </button>
              <button type="button" className={styles.textButton} onClick={() => setConfirming(false)}>
                Avbryt
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Ta bort ${student.name} ur klassen`}
              onClick={() => setConfirming(true)}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </span>
      )}
    </li>
  )
}

function AddStudentForm({ classId }: { classId: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [added, setAdded] = useState<string | null>(null)
  const add = useAddStudent(classId)

  function submit(event: FormEvent) {
    event.preventDefault()
    setAdded(null)
    add.mutate(
      { name, email },
      {
        onSuccess: (student) => {
          setAdded(student.name)
          setName('')
          setEmail('')
        },
      },
    )
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Lägg till elev</h2>
      </div>
      <div className={styles.cardBody}>
        <form className={styles.form} onSubmit={submit}>
          <TextField label="Namn" name="name" required value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            label="E-post"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={add.isPending}>
            Lägg till
          </Button>
          {add.isError && (
            <p className={styles.formError} role="alert">
              {add.error.message}
            </p>
          )}
          {added && (
            <p className={styles.formSuccess} role="status">
              {added} är tillagd i klassen.
            </p>
          )}
        </form>
        <p className={styles.hint}>
          Finns eleven redan på skolan kopplas hen till klassen. Annars skapas ett nytt elevkonto.
        </p>
      </div>
    </Card>
  )
}

function TeachersCard({ classId, teachers, schoolId }: { classId: string; teachers: Person[]; schoolId: string }) {
  const [selected, setSelected] = useState('')
  const schoolTeachers = useSchoolTeachers(schoolId, true)
  const assign = useAssignTeacher(classId)
  const unassign = useUnassignTeacher(classId)
  const available = (schoolTeachers.data ?? []).filter((t) => !teachers.some((c) => c.id === t.id))

  function submit(event: FormEvent) {
    event.preventDefault()
    if (selected) assign.mutate(selected, { onSuccess: () => setSelected('') })
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Lärare</h2>
        <span className={styles.count}>{teachers.length}</span>
      </div>
      {teachers.length === 0 ? (
        <p className={styles.empty}>Ingen lärare har klassen än.</p>
      ) : (
        <ul className={styles.list}>
          {teachers.map((teacher) => (
            <li key={teacher.id} className={styles.row}>
              <span className={styles.rowLink}>
                <Avatar name={teacher.name} />
                <span className={styles.rowText}>
                  <span className={styles.name}>{teacher.name}</span>
                  <span className={styles.meta}>{teacher.email}</span>
                </span>
              </span>
              <span className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Ta bort ${teacher.name} från klassen`}
                  disabled={unassign.isPending}
                  onClick={() => unassign.mutate(teacher.id)}
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.cardBody}>
        {available.length > 0 ? (
          <form className={styles.inline} onSubmit={submit}>
            <label className={styles.select}>
              <span className="sr-only">Välj lärare</span>
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Välj lärare</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
            <Button type="submit" variant="primary" disabled={!selected || assign.isPending}>
              Koppla lärare
            </Button>
          </form>
        ) : (
          <p className={styles.hint}>
            {schoolTeachers.isPending ? 'Hämtar skolans lärare…' : 'Alla skolans lärare har redan klassen.'}
          </p>
        )}
      </div>
    </Card>
  )
}
