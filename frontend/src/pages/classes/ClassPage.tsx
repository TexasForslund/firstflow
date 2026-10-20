import { BriefcaseBusiness, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import {
  useAddStudent,
  useAssignTeacher,
  useClass,
  useRemoveStudent,
  useSchoolTeachers,
  useUnassignTeacher,
  type Person,
} from '../../api/classes'
import { useClassReports } from '../../api/reports'
import { useStudents } from '../../api/students'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, Card, SearchSelect, SelectField, type SearchSelectOption } from '../../components'
import { NotFound } from '../NotFound'
import { AplTermsForm } from './AplTermsForm'
import { ClassReports } from './ClassReports'
import { FormBuilder } from './questions/FormBuilder'
import { aplSummary } from './aplTerms'
import styles from './Classes.module.css'

type TabId = 'students' | 'reports' | 'terms' | 'questions' | 'teachers'

export function ClassPage() {
  const { classId = '' } = useParams()
  const { data: user } = useCurrentUser()
  const query = useClass(classId)
  const [params, setParams] = useSearchParams()
  // Bara läraren läser redovisningarna. Antalet olästa visas på fliken.
  const isTeacher = user?.role === 'teacher'
  const unread = useClassReports(classId, { unreadOnly: true }, isTeacher)

  if (query.isPending) return <p className={styles.state}>Laddar klassen…</p>
  if (query.isError) return <NotFound what="Klassen" />

  const cls = query.data
  const canEdit = user?.role === 'teacher' || user?.role === 'school_admin'
  const canAssignTeachers = user?.role === 'school_admin'
  const teacherNames = cls.teachers.map((t) => t.name).join(', ')

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'students', label: 'Elever', count: cls.students.length },
    ...(isTeacher ? [{ id: 'reports' as const, label: 'Redovisningar', count: unread.data?.length || undefined }] : []),
    { id: 'terms', label: 'APL-villkor' },
    { id: 'questions', label: 'Frågor' },
    ...(canAssignTeachers ? [{ id: 'teachers' as const, label: 'Lärare', count: cls.teachers.length }] : []),
  ]
  const requested = params.get('tab') as TabId | null
  const tab: TabId = tabs.some((t) => t.id === requested) ? requested! : 'students'

  return (
    <div className={`${styles.page} ${tab === 'questions' && canEdit ? styles.pageWide : ''}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{cls.name}</h1>
        <p className={styles.subtitle}>
          {cls.students.length} {cls.students.length === 1 ? 'elev' : 'elever'}
          {teacherNames ? ` · ${teacherNames}` : ' · Ingen lärare kopplad'}
          {aplSummary(cls.apl_terms) && ` · ${aplSummary(cls.apl_terms)}`}
        </p>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Klassens delar">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setParams(t.id === 'students' ? {} : { tab: t.id }, { replace: true })}
          >
            {t.label}
            {t.count !== undefined && <span className={styles.tabCount}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.panel}>
        {tab === 'students' && (
          <>
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
            {canEdit && (
              <AddStudentForm classId={cls.id} inClass={cls.students} isTeacher={user?.role === 'teacher'} />
            )}
          </>
        )}
        {tab === 'reports' && <ClassReports classId={cls.id} students={cls.students} />}
        {tab === 'terms' && <AplTermsForm classId={cls.id} terms={cls.apl_terms} canEdit={canEdit} />}
        {tab === 'questions' && <FormBuilder classId={cls.id} canEdit={canEdit} />}
        {tab === 'teachers' && <TeachersCard classId={cls.id} teachers={cls.teachers} schoolId={cls.school_id} />}
      </div>
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
      {/* Tilldelning av praktikplats och projekt kopplas in med B3 och B12. */}
      <span className={styles.placement}>
        <BriefcaseBusiness aria-hidden="true" />
        <span>Ingen praktikplats</span>
      </span>
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

function AddStudentForm({ classId, inClass, isTeacher }: { classId: string; inClass: Person[]; isTeacher: boolean }) {
  const students = useStudents()
  const add = useAddStudent(classId)
  const [added, setAdded] = useState<string | null>(null)
  const candidates: SearchSelectOption[] = (students.data ?? [])
    .filter((s) => !inClass.some((c) => c.id === s.id))
    .map((s) => ({
      id: s.id,
      label: s.name,
      description: [s.email, ...s.classes.map((c) => c.name)].join(' · '),
    }))

  const emptyText = isTeacher
    ? (students.data ?? []).length === 0
      ? 'Inga elever är kopplade till dig än. Skolans administratör kopplar elever till lärare.'
      : 'Alla dina elever är redan i klassen.'
    : 'Alla skolans elever är redan i klassen.'

  return (
    <Card className={styles.overflowVisible}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Lägg till elev</h2>
      </div>
      <div className={styles.cardBody}>
        <SearchSelect
          label={isTeacher ? 'Välj bland dina elever' : 'Välj bland skolans elever'}
          placeholder="Sök på namn eller e-post"
          options={candidates}
          emptyText={students.isPending ? 'Hämtar elever…' : emptyText}
          onSelect={(option) => {
            // Fältet stängs inte av medan eleven läggs till, så att fokus stannar kvar.
            if (add.isPending) return
            setAdded(null)
            add.mutate(option.id, { onSuccess: () => setAdded(option.label) })
          }}
        />
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
        <p className={styles.hint}>
          {isTeacher
            ? 'Listan visar elever som skolans administratör har kopplat till dig.'
            : 'Nya elever läggs in under Elever.'}
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
          <form className={styles.inline} style={{ alignItems: 'end' }} onSubmit={submit}>
            <div style={{ flex: 1, minWidth: '14rem' }}>
              <SelectField label="Koppla en lärare på skolan" value={selected} onChange={setSelected}>
                <option value="">Välj lärare</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectField>
            </div>
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
