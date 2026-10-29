import { CalendarCheck } from 'lucide-react'
import { Link } from 'react-router'

import { clockTime } from '../../api/attendance'
import { useTeacherOverview, type TeacherOverview } from '../../api/overview'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Card, CardTitle } from '../../components'
import styles from './Overview.module.css'
import { AttentionTabs } from './AttentionTabs'
import { ReportPreview } from './ReportPreview'

function dateLabel(iso: string) {
  const text = new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Lärarens översikt (F6): det läraren behöver titta på i dag, för klasserna hen undervisar.
 * Skissen är docs/design/larare-oversikt.png, flik A. Meddelanden kommer när de är byggda.
 */
export function Overview() {
  const { data: user } = useCurrentUser()
  const query = useTeacherOverview()
  const firstName = user?.name.split(' ')[0]

  if (query.isPending) return <p className={styles.state}>Laddar översikten…</p>
  if (query.isError) return <p className={styles.state}>Översikten gick inte att hämta. Ladda om sidan.</p>

  const data = query.data
  const notCheckedIn = data.on_apl - data.checked_in

  return (
    <div className={styles.page}>
      <p className={styles.date}>
        {dateLabel(data.today)}
        {firstName ? ` · Hej ${firstName}` : ''}
      </p>
      <h1 className={styles.title}>Det här behöver du titta på i dag</h1>
      <p className={styles.stats}>
        <span>
          <strong>{data.on_apl}</strong> {data.on_apl === 1 ? 'elev' : 'elever'} på APL
        </span>
        <span>
          <strong className={styles.present}>{data.confirmed}</strong> bekräftade
        </span>
        <span>
          <strong className={styles.pending}>{data.pending}</strong> väntar på handledare
        </span>
        <span>
          <strong className={notCheckedIn > 0 ? styles.absent : undefined}>{notCheckedIn}</strong> ej incheckade
        </span>
      </p>

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          <div className={styles.orderFirst}>
            <AttentionTabs items={data.attention} />
          </div>
          <section aria-labelledby="reports-heading" className={styles.orderLast}>
            <div className={styles.sectionHeader}>
              <h2 id="reports-heading" className={styles.sectionTitle}>
                Veckoredovisningar att läsa
              </h2>
            </div>
            {data.reports.length === 0 ? (
              <Card>
                <p className={styles.empty}>Inga olästa redovisningar. Bra jobbat!</p>
              </Card>
            ) : (
              <div className={styles.stack}>
                {data.reports.map((report) => (
                  <ReportPreview key={report.id} report={report} />
                ))}
                {data.unread_reports > data.reports.length && (
                  <p className={styles.more}>
                    Visar de {data.reports.length} senaste av {data.unread_reports} olästa. Resten finns i klassernas
                    flik Redovisningar.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
        <div className={styles.sideColumn}>
          <div className={styles.orderSide}>
            <AttendanceCard data={data} />
          </div>
        </div>
      </div>
    </div>
  )
}

function AttendanceCard({ data }: { data: TeacherOverview }) {
  const percent = data.on_apl > 0 ? Math.round((data.checked_in / data.on_apl) * 100) : null
  const missing = data.on_apl - data.confirmed - data.pending
  const share = (n: number) => `${data.on_apl > 0 ? (n / data.on_apl) * 100 : 0}%`

  return (
    <Card>
      <div className={styles.cardBody}>
        <div className={styles.cardHead}>
          <CardTitle icon={<CalendarCheck aria-hidden="true" />}>Dagens närvaro</CardTitle>
          <Link to="/attendance" className={styles.weekLink}>
            Veckan
          </Link>
        </div>
        {percent === null ? (
          <p className={styles.noApl}>Ingen av dina elever har APL i dag.</p>
        ) : (
          <>
            <div className={styles.bigNumber}>
              <span className={styles.percent}>{percent}%</span>
              <span className={styles.bigNumberLabel}>av eleverna incheckade</span>
            </div>
            <span
              className={styles.stateBar}
              role="img"
              aria-label={`${data.confirmed} bekräftade, ${data.pending} väntar på handledare, ${missing} ej incheckade`}
            >
              <span className={styles.barConfirmed} style={{ width: share(data.confirmed) }} />
              <span className={styles.barPending} style={{ width: share(data.pending) }} />
            </span>
            <ul className={styles.legend} aria-hidden="true">
              <li>
                <span className={styles.barConfirmed} /> Bekräftad {data.confirmed}
              </li>
              <li>
                <span className={styles.barPending} /> Väntar på handledare {data.pending}
              </li>
              <li>
                <span className={styles.barMissing} /> Ej incheckad {missing}
              </li>
            </ul>
            <ul className={styles.todayList}>
              {data.today_students.map((t) => (
                <TodayRow key={t.student.id} row={t} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  )
}

function TodayRow({ row }: { row: TeacherOverview['today_students'][number] }) {
  const supervisor = row.supervisor?.name.split(' ')[0] ?? 'Handledaren'
  const time = row.checked_in_at ? `In ${clockTime(row.checked_in_at)}` : null
  const conflict = row.state === 'not_present' && !!row.checked_in_at
  const meta = {
    confirmed: time ? `${time} · bekräftad av ${supervisor}` : `${supervisor} lade till dagen`,
    pending: `${time} · ${supervisor} har inte bekräftat`,
    not_present: conflict ? `${time} · ` : `${supervisor}: inte på plats`,
    missing: 'Ingen incheckning i dag',
  }[row.state]
  const label = {
    confirmed: 'Bekräftad',
    pending: 'Väntar',
    not_present: conflict ? 'Stämmer inte' : 'Inte på plats',
    missing: 'Ej incheckad',
  }[row.state]

  return (
    <li className={styles.todayRow}>
      <Avatar name={row.student.name} size="sm" />
      <Link to={`/students/${row.student.id}`} className={styles.todayText}>
        <span className={styles.todayName}>{row.student.name}</span>
        <span className={styles.todayMeta}>
          {meta}
          {conflict && <span className={styles.conflictText}>{supervisor}: inte på plats</span>}
        </span>
      </Link>
      <span className={styles.statePill} data-state={conflict ? 'conflict' : row.state}>
        {conflict && <span className={styles.conflictDot} aria-hidden="true" />}
        {label}
      </span>
    </li>
  )
}
