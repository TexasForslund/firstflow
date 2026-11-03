import { ArrowRight, ChartColumn, FileSignature, MapPinCheck, MessageCircle, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { useReviewList } from '../../api/attendance'
import { useContracts } from '../../api/contracts'
import { useUnreadMessages } from '../../api/messages'
import { useSupervisedStudents, type SupervisedStudent } from '../../api/placements'
import { useSupervisorReports } from '../../api/reports'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar } from '../../components'
import { periodWeek } from '../placements/period'
import styles from './MyStudents.module.css'
import { WeekDots } from './WeekDots'
import { weekDays } from './weekDays'

function names(list: string[]) {
  const first = [...new Set(list.map((n) => n.split(' ')[0]))]
  if (first.length <= 1) return first.join('')
  if (first.length > 3) return `${first.slice(0, 2).join(', ')} och ${first.length - 2} till`
  return `${first.slice(0, -1).join(', ')} och ${first.at(-1)}`
}

interface Todo {
  to: string
  icon: LucideIcon
  tone: 'butter' | 'primary' | 'sky' | 'mint'
  count: number
  title: string
  detail: string
  action: string
}

/**
 * Handledarens översikt (Texas skiss "Handledarens vy, del 2", 2026-11-03): det som väntar i dag
 * överst och eleverna med veckans närvaro under.
 */
export function MyStudents() {
  const { data: user } = useCurrentUser()
  const students = useSupervisedStudents()
  const review = useReviewList()
  const reports = useSupervisorReports()
  const contracts = useContracts()
  const messages = useUnreadMessages()
  const firstName = user?.name.split(' ')[0] ?? ''

  const pending = [...(review.data?.today_items ?? []), ...(review.data?.earlier ?? [])].filter(
    (i) => i.state === 'pending',
  )
  const unread = (reports.data ?? []).filter((r) => !r.is_read)
  const toSign = (contracts.data ?? []).filter((c) => c.my_turn)
  const todos: Todo[] = [
    {
      to: '/attendance-review',
      icon: MapPinCheck,
      tone: 'butter',
      count: pending.length,
      title: 'Bekräfta närvaro',
      detail: `${names(pending.map((i) => i.student.name))} har checkat in`,
      action: 'Bekräfta',
    },
    {
      to: '/student-reports',
      icon: ChartColumn,
      tone: 'primary',
      count: unread.length,
      title: unread.length === 1 ? 'Ny redovisning' : 'Nya redovisningar',
      detail: `Från ${names(unread.map((r) => r.student.name))}`,
      action: 'Läs',
    },
    {
      to: toSign.length === 1 ? `/contracts/${toSign[0].id}` : '/contracts',
      icon: FileSignature,
      tone: 'sky',
      count: toSign.length,
      title: toSign.length === 1 ? 'Kontrakt att signera' : 'Kontrakt att signera',
      detail:
        toSign.length === 1
          ? `${toSign[0].title}, ${toSign[0].student.name}`
          : names(toSign.map((c) => c.student.name)),
      action: 'Signera',
    },
    {
      to: '/messages',
      icon: MessageCircle,
      tone: 'mint',
      count: messages.data ?? 0,
      title: messages.data === 1 ? 'Nytt meddelande' : 'Nya meddelanden',
      detail: 'I Meddelanden',
      action: 'Läs',
    },
  ].filter((t) => t.count > 0) as Todo[]
  const loading = review.isPending || reports.isPending || contracts.isPending

  // En handledare kan finnas på flera arbetsplatser, även på olika skolor.
  const byWorkplace = new Map<string, { workplace: SupervisedStudent['workplace']; students: SupervisedStudent[] }>()
  for (const s of students.data ?? []) {
    const group = byWorkplace.get(s.workplace.id) ?? { workplace: s.workplace, students: [] }
    group.students.push(s)
    byWorkplace.set(s.workplace.id, group)
  }
  const today = review.data
    ? new Date(`${review.data.today}T12:00:00`).toLocaleDateString('sv-SE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : ''

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Hej {firstName}!</h1>
        <p className={styles.subtitle}>
          {today && `${today.charAt(0).toUpperCase() + today.slice(1)}. `}
          {!loading && (todos.length > 0 ? 'Det här väntar på dig.' : 'Inget väntar på dig just nu.')}
        </p>
      </header>

      {todos.length > 0 && (
        <ul className={styles.todos} aria-label="Att göra">
          {todos.map((t) => (
            <li key={t.to}>
              <Link to={t.to} className={styles.todo} data-tone={t.tone}>
                <span className={styles.todoCount}>
                  <t.icon aria-hidden="true" />
                  {t.count}
                </span>
                <span className={styles.todoText}>
                  <span className={styles.todoTitle}>{t.title}</span>
                  <span className={styles.todoDetail}>{t.detail}</span>
                </span>
                <span className={styles.todoAction}>
                  {t.action} <ArrowRight aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {students.isPending && <p className={styles.muted}>Laddar eleverna…</p>}
      {students.isError && <p className={styles.muted}>Eleverna gick inte att hämta. Ladda om sidan.</p>}
      {students.isSuccess && students.data.length === 0 && (
        <section className={styles.card}>
          <p className={styles.empty}>
            När en lärare placerar en elev hos dig visas eleven här, med företag och period.
          </p>
        </section>
      )}

      {[...byWorkplace.values()].map(({ workplace, students: group }) => (
        <section key={workplace.id} className={styles.card} aria-labelledby={`wp-${workplace.id}`}>
          <div className={styles.cardHead}>
            <span>
              <h2 id={`wp-${workplace.id}`} className={styles.cardTitle}>
                Mina elever
              </h2>
              <span className={styles.muted}>{workplace.name} · den här veckan</span>
            </span>
            <span className={styles.legend} aria-hidden="true">
              <span data-state="confirmed">på plats</span>
              <span data-state="pending">väntar på dig</span>
              <span data-state="not_present">inte på plats</span>
            </span>
          </div>
          <ul className={styles.list}>
            {group.map((s) => {
              const { week, weeks } = periodWeek(s.start_date, s.end_date)
              const days = weekDays(review.data, s.placement_id)
              const todayItem = days.find((d) => d.isToday)?.item
              const newReports = unread.filter((r) => r.student.id === s.student.id).length
              const contract = toSign.some((c) => c.student.id === s.student.id)
              return (
                <li key={s.placement_id}>
                  <Link to={`/my-students/${s.student.id}`} className={styles.row}>
                    <span className={styles.person}>
                      <Avatar name={s.student.name} />
                      <span className={styles.personText}>
                        <span className={styles.name}>{s.student.name}</span>
                        <span className={styles.muted}>
                          Vecka {week} av {weeks}
                        </span>
                      </span>
                    </span>
                    <WeekDots days={days} />
                    <span className={styles.tags}>
                      {todayItem?.state === 'missing' && (
                        <span className={styles.tag} data-tone="attention">
                          Ej incheckad i dag
                        </span>
                      )}
                      {newReports > 0 && (
                        <span className={styles.tag} data-tone="primary">
                          {newReports === 1 ? '1 ny redovisning' : `${newReports} nya redovisningar`}
                        </span>
                      )}
                      {contract && (
                        <span className={styles.tag} data-tone="butter">
                          Kontrakt att signera
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
