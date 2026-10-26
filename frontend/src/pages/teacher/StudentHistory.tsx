import { ArrowUpRight, BriefcaseBusiness, FileText, User, Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'

import { useClasses } from '../../api/classes'
import { useStudents, type Student } from '../../api/students'
import { Avatar, Combobox, FilterChip, InfoChip } from '../../components'
import styles from './StudentHistory.module.css'

const NO_CLASS = 'none'

/**
 * Elevhistorik: alla lärarens elever, grupperade per klass. Varje elev leder till elevsidan,
 * där allt om eleven är samlat (Texas, 2026-10-26).
 */
export function StudentHistory() {
  const [params, setParams] = useSearchParams()
  const students = useStudents()
  const classes = useClasses()
  const classId = params.get('class') ?? ''
  const studentId = params.get('student') ?? ''

  function update(next: { class?: string; student?: string }) {
    const p = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) p.set(key, value)
      else p.delete(key)
    }
    setParams(p, { replace: true })
  }

  const all = students.data ?? []
  const classList = classes.data ?? []
  const classOf = (s: Student) => s.classes[0]?.id ?? NO_CLASS
  const inClass = all.filter((s) => !classId || classOf(s) === classId)
  const visible = inClass.filter((s) => !studentId || s.id === studentId)
  const selectedStudent = all.find((s) => s.id === studentId)
  const selectedClass = classList.find((c) => c.id === classId)

  // Grupper i klassordning. Elever utan klass sist.
  const groups = [
    ...classList.map((c) => ({ id: c.id, name: c.name })),
    { id: NO_CLASS, name: 'Utan klass' },
  ]
    .map((g) => ({ ...g, students: visible.filter((s) => classOf(s) === g.id) }))
    .filter((g) => g.students.length > 0)

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Elevhistorik</h1>

      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>Filter:</span>
        <div className={styles.filterField}>
          <Combobox
            label="Klass"
            value={classId}
            onChange={(id) => update({ class: id, student: '' })}
            placeholder="Välj klass"
            options={classList.map((c) => ({ id: c.id, label: c.name, description: `${c.student_count} elever` }))}
          />
        </div>
        <div className={styles.filterField}>
          <Combobox
            label="Elev"
            value={studentId}
            onChange={(id) => update({ student: id })}
            placeholder="Sök elev"
            options={inClass.map((s) => ({ id: s.id, label: s.name, description: s.classes[0]?.name }))}
          />
        </div>
      </div>

      {(selectedClass || selectedStudent) && (
        <div className={styles.activeFilters}>
          {selectedClass && (
            <FilterChip
              icon={<Users aria-hidden="true" />}
              onRemove={() => update({ class: '', student: '' })}
              removeLabel={`Ta bort filtret klass ${selectedClass.name}`}
            >
              Klass: {selectedClass.name}
            </FilterChip>
          )}
          {selectedStudent && (
            <FilterChip
              icon={<User aria-hidden="true" />}
              onRemove={() => update({ student: '' })}
              removeLabel={`Ta bort filtret elev ${selectedStudent.name}`}
            >
              Elev: {selectedStudent.name}
            </FilterChip>
          )}
        </div>
      )}

      {students.isPending && <p className={styles.state}>Laddar elever…</p>}
      {students.isError && <p className={styles.state}>Eleverna gick inte att hämta. Ladda om sidan.</p>}
      {students.isSuccess && all.length === 0 && (
        <p className={styles.state}>Du har inga elever än. Skolans administratör kopplar elever till dig.</p>
      )}

      {groups.map((group) => (
        <section key={group.id} className={styles.group} aria-labelledby={`group-${group.id}`}>
          <h2 id={`group-${group.id}`} className={styles.groupTitle}>
            {group.name}
          </h2>
          <ul>
            {group.students.map((student) => (
              <li key={student.id} className={styles.row}>
                <Link to={`/students/${student.id}`} className={styles.rowLink}>
                  <Avatar name={student.name} />
                  <span className={styles.rowText}>
                    <span className={styles.name}>{student.name}</span>
                    <span className={styles.className}>{student.classes[0]?.name ?? 'Ingen klass'}</span>
                  </span>
                  <ArrowUpRight aria-hidden="true" className={styles.arrow} />
                </Link>
                <div className={styles.chips}>
                  <InfoChip icon={<BriefcaseBusiness aria-hidden="true" />}>
                    {student.workplace?.name ?? 'Ingen praktikplats'}
                  </InfoChip>
                  <InfoChip icon={<FileText aria-hidden="true" />}>
                    {student.report_count}: {student.report_count === 1 ? 'Redovisning' : 'Redovisningar'}
                  </InfoChip>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
