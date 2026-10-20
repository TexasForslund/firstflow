import { ArrowUpRight, ChevronDown, FileText, Folder, User, Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'

import { Avatar, FilterChip, InfoChip } from '../../components'
import { classById, classes, reports, studentById, students, studentsInClass } from '../../demo/data'
import styles from './StudentHistory.module.css'

export function StudentHistory() {
  const [params, setParams] = useSearchParams()
  const classId = params.get('class') ?? ''
  const studentId = params.get('student') ?? ''
  const selectedStudent = studentId ? studentById(studentId) : undefined

  function update(next: { class?: string; student?: string }) {
    const p = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) p.set(key, value)
      else p.delete(key)
    }
    setParams(p, { replace: true })
  }

  const studentOptions = classId ? studentsInClass(classId) : students
  const visibleClasses = classes.filter((c) => {
    if (classId && c.id !== classId) return false
    if (selectedStudent && selectedStudent.classId !== c.id) return false
    return true
  })

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Elevhistorik</h1>

      <div className={styles.filterBar}>
        <span className={styles.filterLabel} id="filter-label">
          Filter:
        </span>
        <label className={styles.select}>
          <span className="sr-only">Välj klass</span>
          <select
            aria-describedby="filter-label"
            value={classId}
            onChange={(e) => update({ class: e.target.value, student: '' })}
          >
            <option value="">Välj klass</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" />
        </label>
        <label className={styles.select}>
          <span className="sr-only">Välj elev</span>
          <select aria-describedby="filter-label" value={studentId} onChange={(e) => update({ student: e.target.value })}>
            <option value="">Välj elev</option>
            {studentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" />
        </label>
      </div>

      {(classId || selectedStudent) && (
        <div className={styles.activeFilters}>
          {classId && (
            <FilterChip
              icon={<Users aria-hidden="true" />}
              onRemove={() => update({ class: '' })}
              removeLabel={`Ta bort filtret klass ${classById(classId)?.name}`}
            >
              Klass: {classById(classId)?.name}
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

      {visibleClasses.map((cls) => {
        const list = studentsInClass(cls.id).filter((s) => !selectedStudent || s.id === selectedStudent.id)
        return (
          <section key={cls.id} className={styles.group} aria-labelledby={`group-${cls.id}`}>
            <h2 id={`group-${cls.id}`} className={styles.groupTitle}>
              {cls.name}
            </h2>
            <ul>
              {list.map((student) => {
                const latest = reports.find((r) => r.studentId === student.id)
                const to = latest ? `/reports/${latest.id}` : `/students/${student.id}`
                return (
                  <li key={student.id} className={styles.row}>
                    <Link to={to} className={styles.rowLink}>
                      <Avatar name={student.name} />
                      <span className={styles.rowText}>
                        <span className={styles.name}>{student.name}</span>
                        <span className={styles.className}>{cls.name}</span>
                      </span>
                      <ArrowUpRight aria-hidden="true" className={styles.arrow} />
                    </Link>
                    <div className={styles.chips}>
                      <InfoChip icon={<Folder aria-hidden="true" />}>
                        {student.projects.length}: {student.projects.length === 1 ? 'Projekt tilldelat' : 'Projekt tilldelade'}
                      </InfoChip>
                      <InfoChip icon={<FileText aria-hidden="true" />}>{student.reportCount}: Redovisningar</InfoChip>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
