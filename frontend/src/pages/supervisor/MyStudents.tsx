import { MapPin } from 'lucide-react'

import { useSupervisorAttendance, type SupervisorAttendance } from '../../api/attendance'
import { useSupervisedStudents, type SupervisedStudent } from '../../api/placements'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Card } from '../../components'
import styles from '../classes/Classes.module.css'
import { periodCountdown, periodText, periodWeek } from '../placements/period'
import own from './MyStudents.module.css'

/** Handledarens startsida: eleverna hen handleder i dag, grupperade per arbetsplats. */
export function MyStudents() {
  const { data: user } = useCurrentUser()
  const query = useSupervisedStudents()
  const attendance = useSupervisorAttendance()
  const todayByPlacement = new Map((attendance.data ?? []).map((a) => [a.placement_id, a]))
  const students = query.data ?? []
  const firstName = user?.name.split(' ')[0] ?? ''

  // En handledare kan finnas på flera arbetsplatser, även på olika skolor.
  const byWorkplace = new Map<string, { workplace: SupervisedStudent['workplace']; students: SupervisedStudent[] }>()
  for (const s of students) {
    const group = byWorkplace.get(s.workplace.id) ?? {
      workplace: s.workplace,
      students: [],
    }
    group.students.push(s)
    byWorkplace.set(s.workplace.id, group)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Mina elever</h1>
        <p className={styles.subtitle}>
          {query.isSuccess &&
            (students.length === 0
              ? `Hej ${firstName}! Du har inga elever på APL just nu.`
              : `Hej ${firstName}! Du handleder ${students.length} ${students.length === 1 ? 'elev' : 'elever'} just nu.`)}
        </p>
      </header>

      {query.isPending && <p className={styles.state}>Laddar eleverna…</p>}
      {query.isError && <p className={styles.state}>Eleverna gick inte att hämta. Ladda om sidan.</p>}

      {query.isSuccess && students.length === 0 && (
        <Card>
          <p className={styles.empty}>
            När en lärare placerar en elev hos dig visas eleven här, med arbetsplats och period.
          </p>
        </Card>
      )}

      {[...byWorkplace.values()].map(({ workplace, students: group }) => (
        <Card key={workplace.id}>
          <div className={styles.cardHeader}>
            <div className={own.workplaceHeading}>
              <h2 className={styles.cardTitle}>{workplace.name}</h2>
              {workplace.address && (
                <span className={own.address}>
                  <MapPin aria-hidden="true" />
                  {workplace.address}
                </span>
              )}
            </div>
            <span className={styles.count}>{group.length}</span>
          </div>
          <ul className={styles.list}>
            {group.map((s) => {
              const { week, weeks } = periodWeek(s.start_date, s.end_date)
              return (
                <li key={s.placement_id} className={styles.row}>
                  <span className={styles.rowLink}>
                    <Avatar name={s.student.name} />
                    <span className={styles.rowText}>
                      <span className={styles.name}>{s.student.name}</span>
                      <span className={styles.meta}>{periodText(s.start_date, s.end_date)}</span>
                    </span>
                  </span>
                  <span className={own.progress}>
                    <TodayStatus row={todayByPlacement.get(s.placement_id)} loading={attendance.isPending} />
                    <span className={own.countdown}>
                      Vecka {week} av {weeks} · {periodCountdown(s.start_date, s.end_date)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      ))}
    </div>
  )
}

/** Dagens status: incheckad med tid, frånvarande, sjuk eller inte incheckad. */
function TodayStatus({ row, loading }: { row: SupervisorAttendance | undefined; loading: boolean }) {
  if (loading) return <span className={own.status}>…</span>
  if (!row?.status) return <span className={`${own.status} ${own.statusNone}`}>Inte incheckad</span>
  if (row.status === 'present') {
    const at = row.checked_in_at
      ? new Date(row.checked_in_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
      : ''
    return <span className={`${own.status} ${own.statusPresent}`}>Incheckad {at}</span>
  }
  return (
    <span className={`${own.status} ${own.statusAway}`} title={row.note ?? undefined}>
      {row.status === 'sick' ? 'Sjuk' : 'Frånvarande'}
    </span>
  )
}
