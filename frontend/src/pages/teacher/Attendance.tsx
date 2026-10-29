import { useSearchParams } from 'react-router'

import { useClasses } from '../../api/classes'
import { Card, Combobox } from '../../components'
import styles from '../classes/Classes.module.css'
import own from './Attendance.module.css'
import { WeekAttendance } from './WeekAttendance'

/**
 * Närvaro för en klass vecka för vecka, med handledarens bekräftelse (Texas, 2026-10-29).
 * Listan "Elever" med perioder är borttagen: veckotabellen visar samma sak tydligare.
 */
export function Attendance() {
  const classes = useClasses()
  const [params, setParams] = useSearchParams()
  const list = classes.data ?? []
  const classId = params.get('class') ?? list[0]?.id ?? ''

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Närvaro</h1>
        <p className={styles.subtitle}>Incheckningar och handledarens bekräftelse, vecka för vecka.</p>
      </header>

      {classes.isSuccess && list.length === 0 && (
        <Card>
          <p className={styles.empty}>Du har inga klasser än.</p>
        </Card>
      )}

      {list.length > 1 && (
        <div className={own.classSelect}>
          <Combobox
            label="Klass"
            value={classId}
            onChange={(id) => id && setParams({ class: id }, { replace: true })}
            placeholder="Sök klass"
            options={list.map((c) => ({ id: c.id, label: c.name, description: `${c.student_count} elever` }))}
          />
        </div>
      )}

      {classId && <WeekAttendance classId={classId} />}
    </div>
  )
}
