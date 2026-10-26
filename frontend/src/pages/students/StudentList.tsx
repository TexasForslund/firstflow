import { Plus, Users } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { useClasses, useSchoolTeachers } from '../../api/classes'
import { useCreateStudent, useStudents } from '../../api/students'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, Card, Combobox, InfoChip, TextField } from '../../components'
import styles from '../classes/Classes.module.css'
import { CheckList } from './CheckList'

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Elevregistret. Skoladmin lägger in elever, läraren ser sina elever. */
export function StudentList() {
  const { data: user } = useCurrentUser()
  const students = useStudents()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const isAdmin = user?.role === 'school_admin'
  const isTeacher = user?.role === 'teacher'

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    const list = students.data ?? []
    return q ? list.filter((s) => normalize(`${s.name} ${s.email}`).includes(q)) : list
  }, [students.data, query])

  return (
    <div className={styles.page}>
      <div className={styles.titleRow}>
        <header className={styles.header}>
          <h1 className={styles.title}>{isTeacher ? 'Mina elever' : 'Elever'}</h1>
          <p className={styles.subtitle}>
            {isTeacher
              ? 'Elever som skolans administratör har kopplat till dig.'
              : (user?.school_name ?? '')}
          </p>
        </header>
        {isAdmin && !adding && (
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setAdding(true)}>
            Lägg till elev
          </Button>
        )}
      </div>

      {isAdmin && adding && <CreateStudentForm schoolId={user?.school_id} onDone={() => setAdding(false)} />}

      <div className={styles.search}>
        <TextField
          label="Sök elev"
          type="search"
          placeholder="Namn eller e-post"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{query ? 'Sökresultat' : 'Alla elever'}</h2>
          <span className={styles.count}>{filtered.length}</span>
        </div>
        {students.isPending ? (
          <p className={styles.empty}>Laddar elever…</p>
        ) : students.isError ? (
          <p className={styles.empty}>Det gick inte att hämta eleverna. Ladda om sidan.</p>
        ) : filtered.length === 0 ? (
          <p className={styles.empty}>
            {query
              ? `Ingen elev matchar "${query}".`
              : isTeacher
                ? 'Inga elever är kopplade till dig än.'
                : 'Skolan har inga elever än.'}
          </p>
        ) : (
          <ul className={styles.list}>
            {filtered.map((student) => (
              <li key={student.id} className={styles.row}>
                <Link to={`/students/${student.id}`} className={styles.rowLink}>
                  <Avatar name={student.name} />
                  <span className={styles.rowText}>
                    <span className={styles.name}>{student.name}</span>
                    <span className={styles.meta}>
                      {student.email}
                      {!isTeacher && ` · ${student.teachers.map((t) => t.name).join(', ') || 'Ingen lärare'}`}
                    </span>
                  </span>
                </Link>
                <span className={styles.rowActions}>
                  {student.classes.length === 0 ? (
                    <span className={styles.meta}>Ingen klass</span>
                  ) : (
                    student.classes.map((c) => <InfoChip key={c.id} icon={<Users aria-hidden="true" />}>{c.name}</InfoChip>)
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function CreateStudentForm({ schoolId, onDone }: { schoolId?: string | null; onDone: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [teacherIds, setTeacherIds] = useState<string[]>([])
  // En elev går i en klass (Texas, 2026-10-26).
  const [classId, setClassId] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const teachers = useSchoolTeachers(schoolId, true)
  const classes = useClasses()
  const create = useCreateStudent()

  function submit(event: FormEvent) {
    event.preventDefault()
    setCreated(null)
    create.mutate(
      { name, email, teacher_ids: teacherIds, class_ids: classId ? [classId] : [] },
      {
        onSuccess: (student) => {
          setCreated(student.name)
          setName('')
          setEmail('')
          setClassId('')
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
        <form className={styles.formSingle} style={{ maxWidth: 'none' }} onSubmit={submit}>
          {create.isError && (
            <p className={styles.formError} role="alert">
              {create.error.message}
            </p>
          )}
          {created && (
            <p className={styles.formSuccess} role="status">
              {created} är tillagd. Du kan lägga till nästa elev direkt.
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
          <div className={styles.formGrid}>
            <CheckList
              legend="Lärare"
              options={(teachers.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
              selected={teacherIds}
              onChange={setTeacherIds}
              emptyText={teachers.isPending ? 'Hämtar lärare…' : 'Skolan har inga lärare än.'}
            />
            <Combobox
              label="Klass (valfritt)"
              value={classId}
              onChange={setClassId}
              placeholder="Välj klass"
              options={(classes.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
              emptyText={classes.isPending ? 'Hämtar klasser…' : 'Skolan har inga klasser än.'}
            />
          </div>
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              Lägg till elev
            </Button>
            <Button onClick={onDone}>Stäng</Button>
          </div>
          <p className={styles.hint}>
            Läraren som väljs ser eleven under Mina elever och kan lägga hen i sina klasser. Lärarna
            behålls när du lägger till nästa elev.
          </p>
        </form>
      </div>
    </Card>
  )
}
