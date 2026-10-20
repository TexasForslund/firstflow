import { ArrowDownRight, ArrowUpRight, CalendarCheck, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Avatar, Button, ButtonLink, Card, CardFooter, CardTitle, CountBadge, SegmentedBar } from '../../components'
import {
  attendanceToday,
  attention,
  classById,
  classes,
  reports,
  studentById,
  students,
  studentsInClass,
  teacher,
  threads,
  type DemoStudent,
} from '../../demo/data'
import styles from './Overview.module.css'
import { ReportPreview } from './ReportPreview'

const tabs = [
  { id: 'focus', label: 'A - Dagens fokus' },
  { id: 'cards', label: 'B - Kortöversikt' },
  { id: 'students', label: 'C - Per elev' },
] as const

type TabId = (typeof tabs)[number]['id']

function todayLabel() {
  const text = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function Overview() {
  const [tab, setTab] = useState<TabId>('focus')
  const today = attendanceToday()

  return (
    <div className={styles.page}>
      <div className={styles.tabs} role="tablist" aria-label="Visning">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className={styles.date}>
        {todayLabel()} · Hej {teacher.firstName}
      </p>
      <h1 className={styles.title}>Det här behöver du titta på i dag</h1>
      <p className={styles.stats}>
        <span>
          <strong>{today.total}</strong> elever på APL
        </span>
        <span>
          <strong className={styles.present}>{today.present}</strong> incheckade
        </span>
        <span>
          <strong className={styles.absent}>{today.absent}</strong> frånvarande
        </span>
      </p>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'focus' && <FocusView />}
        {tab === 'cards' && <CardsView />}
        {tab === 'students' && <StudentsView />}
      </div>
    </div>
  )
}

/* ─── A: Dagens fokus ──────────────────────────────────────── */

function FocusView() {
  return (
    <div className={styles.columns}>
      <div className={styles.mainColumn}>
        <div className={styles.orderFirst}>
          <AttentionCard />
        </div>
        <section aria-labelledby="reports-heading" className={styles.orderLast}>
          <div className={styles.sectionHeader}>
            <h2 id="reports-heading" className={styles.sectionTitle}>
              Veckoredovisningar att läsa
            </h2>
            <div className={styles.actions}>
              <Button icon={<ArrowDownRight aria-hidden="true" />}>Filtrera</Button>
              <ButtonLink to="/reports" icon={<ArrowUpRight aria-hidden="true" />}>
                Se alla
              </ButtonLink>
            </div>
          </div>
          <div className={styles.stack}>
            {reports
              .filter((r) => !r.read)
              .map((report) => (
                <ReportPreview key={report.id} report={report} />
              ))}
          </div>
        </section>
      </div>
      <div className={styles.sideColumn}>
        <div className={styles.orderSide}>
          <AttendanceCard />
        </div>
        <div className={styles.orderSide}>
          <MessagesCard />
        </div>
      </div>
    </div>
  )
}

function AttentionCard() {
  return (
    <section className={styles.attention} aria-labelledby="attention-heading">
      <h2 id="attention-heading" className={styles.attentionTitle}>
        Behöver uppmärksamhet
      </h2>
      <p className={styles.attentionSubtitle}>{attention.length} saker att följa upp, viktigast först.</p>
      <ul className={styles.attentionList}>
        {attention.map((item) => {
          const student = studentById(item.studentId)
          if (!student) return null
          return (
            <li key={item.studentId}>
              <Link to={`/student-history?student=${student.id}`} className={styles.attentionItem}>
                <Avatar name={student.name} />
                <span className={styles.attentionText}>
                  <span className={styles.attentionName}>{student.name}</span>
                  <span className={styles.attentionReason}>{item.text}</span>
                </span>
                <ArrowUpRight aria-hidden="true" className={styles.arrow} />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function AttendanceCard() {
  const today = attendanceToday()
  const percent = Math.round((today.present / today.total) * 100)
  return (
    <Card>
      <div className={styles.cardBody}>
        <CardTitle icon={<CalendarCheck aria-hidden="true" />}>Dagens närvaro</CardTitle>
        <div className={styles.bigNumber}>
          <span className={styles.percent}>{percent}%</span>
          <span className={styles.bigNumberLabel}>av eleverna incheckade</span>
        </div>
        <SegmentedBar
          present={today.present}
          absent={today.absent}
          total={today.total}
          label={`${today.present} incheckade, ${today.absent} frånvarande av ${today.total}`}
        />
        <ul className={styles.classList}>
          {classes.map((cls) => {
            const t = attendanceToday(studentsInClass(cls.id))
            return (
              <li key={cls.id}>
                <span>{cls.name}</span>
                <span className={styles.classRatio}>
                  {t.present}/{t.total}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}

function MessagesCard() {
  return (
    <Card>
      <div className={styles.cardBody}>
        <CardTitle icon={<MessageCircle aria-hidden="true" />}>Meddelanden</CardTitle>
        <ul className={styles.messages}>
          {threads.slice(0, 3).map((thread) => {
            const student = studentById(thread.studentId)
            if (!student) return null
            return (
              <li key={thread.id}>
                <Link to="/messages" className={styles.message}>
                  <Avatar name={student.name} />
                  <span className={styles.messageText}>
                    <span className={styles.messageName}>{student.name}</span>
                    <span className={styles.messagePreview}>{thread.preview}</span>
                  </span>
                  {thread.unread > 0 && <CountBadge count={thread.unread} label="olästa" />}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
      <CardFooter>
        <ButtonLink to="/messages" icon={<ArrowUpRight aria-hidden="true" />}>
          Se alla
        </ButtonLink>
      </CardFooter>
    </Card>
  )
}

/* ─── B: Kortöversikt ──────────────────────────────────────── */

const statusText: Record<DemoStudent['today'], string> = {
  present: 'Incheckad',
  absent: 'Frånvarande',
  pending: 'Ej incheckad än',
}

function StatusDot({ status }: { status: DemoStudent['today'] }) {
  return (
    <span className={styles.status}>
      <span className={`${styles.dot} ${styles[status]}`} aria-hidden="true" />
      {statusText[status]}
    </span>
  )
}

function CardsView() {
  return (
    <div className={styles.stack}>
      {classes.map((cls) => (
        <section key={cls.id} aria-labelledby={`cards-${cls.id}`}>
          <h2 id={`cards-${cls.id}`} className={styles.groupTitle}>
            {cls.name}
          </h2>
          <ul className={styles.cardGrid}>
            {studentsInClass(cls.id).map((student) => (
              <li key={student.id}>
                <Link to={`/student-history?student=${student.id}`} className={styles.studentCard}>
                  <span className={styles.studentCardTop}>
                    <Avatar name={student.name} />
                    <ArrowUpRight aria-hidden="true" className={styles.arrow} />
                  </span>
                  <span className={styles.studentName}>{student.name}</span>
                  <span className={styles.studentWorkplace}>{student.workplace.name}</span>
                  <StatusDot status={student.today} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/* ─── C: Per elev ──────────────────────────────────────────── */

function StudentsView() {
  const order: Record<DemoStudent['today'], number> = { absent: 0, pending: 1, present: 2 }
  const sorted = [...students].sort((a, b) => order[a.today] - order[b.today] || a.name.localeCompare(b.name, 'sv'))
  return (
    <Card>
      <table className={styles.table}>
        <caption className="sr-only">Alla elever på APL, frånvarande först</caption>
        <thead>
          <tr>
            <th scope="col">Elev</th>
            <th scope="col">I dag</th>
            <th scope="col" className={styles.hideSmall}>
              Närvaro perioden
            </th>
            <th scope="col" className={styles.hideSmall}>
              Praktikplats
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((student) => (
            <tr key={student.id}>
              <td>
                <Link to={`/student-history?student=${student.id}`} className={styles.tableStudent}>
                  <Avatar name={student.name} size="sm" />
                  <span>
                    <span className={styles.tableName}>{student.name}</span>
                    <span className={styles.tableClass}>{classById(student.classId)?.name}</span>
                  </span>
                </Link>
              </td>
              <td>
                <StatusDot status={student.today} />
              </td>
              <td className={styles.hideSmall}>{student.attendancePercent}%</td>
              <td className={styles.hideSmall}>{student.workplace.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
