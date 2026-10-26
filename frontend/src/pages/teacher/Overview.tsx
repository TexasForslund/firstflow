import { ArrowUpRight, CalendarCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useTeacherOverview, type AttentionItem, type TeacherOverview } from '../../api/overview'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Card, CardTitle, SegmentedBar } from '../../components'
import styles from './Overview.module.css'
import { ReportPreview } from './ReportPreview'

/** Hur många saker att följa upp som visas innan "Visa alla". */
const ATTENTION_SHOWN = 6

function dateLabel(iso: string) {
  const text = new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function attentionText(item: AttentionItem) {
  switch (item.reason) {
    case 'missing_check_ins':
      return `Ej incheckad ${plural(item.count, 'dag', 'dagar')} de senaste fyra veckorna`
    case 'missing_reports':
      return `Har inte lämnat ${plural(item.count, 'redovisning', 'redovisningar')}`
    case 'no_placement':
      return 'Har ingen praktikplats'
  }
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
          <strong className={styles.present}>{data.checked_in}</strong> incheckade
        </span>
        <span>
          <strong className={notCheckedIn > 0 ? styles.absent : undefined}>{notCheckedIn}</strong> ej incheckade
        </span>
      </p>

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          <div className={styles.orderFirst}>
            <AttentionCard items={data.attention} />
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

function AttentionCard({ items }: { items: AttentionItem[] }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? items : items.slice(0, ATTENTION_SHOWN)

  return (
    <section className={styles.attention} aria-labelledby="attention-heading">
      <h2 id="attention-heading" className={styles.attentionTitle}>
        Behöver uppmärksamhet
      </h2>
      <p className={styles.attentionSubtitle}>
        {items.length === 0
          ? 'Inget att följa upp just nu.'
          : `${plural(items.length, 'sak', 'saker')} att följa upp, viktigast först.`}
      </p>
      {items.length > 0 && (
        <ul className={styles.attentionList}>
          {shown.map((item) => (
            <li key={`${item.student.id}-${item.reason}`}>
              <Link to={`/students/${item.student.id}`} className={styles.attentionItem}>
                <Avatar name={item.student.name} />
                <span className={styles.attentionText}>
                  <span className={styles.attentionName}>
                    {item.student.name} <span className={styles.attentionClass}>{item.class_name}</span>
                  </span>
                  <span className={styles.attentionReason}>{attentionText(item)}</span>
                </span>
                <ArrowUpRight aria-hidden="true" className={styles.arrow} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > ATTENTION_SHOWN && (
        <button type="button" className={styles.showAll} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Visa färre' : `Visa alla ${items.length}`}
        </button>
      )}
    </section>
  )
}

function AttendanceCard({ data }: { data: TeacherOverview }) {
  const percent = data.on_apl > 0 ? Math.round((data.checked_in / data.on_apl) * 100) : null
  const classes = data.classes.filter((c) => c.on_apl > 0)

  return (
    <Card>
      <div className={styles.cardBody}>
        <CardTitle icon={<CalendarCheck aria-hidden="true" />}>Dagens närvaro</CardTitle>
        {percent === null ? (
          <p className={styles.noApl}>Ingen av dina elever har APL i dag.</p>
        ) : (
          <>
            <div className={styles.bigNumber}>
              <span className={styles.percent}>{percent}%</span>
              <span className={styles.bigNumberLabel}>av eleverna incheckade</span>
            </div>
            <SegmentedBar
              present={data.checked_in}
              absent={0}
              total={data.on_apl}
              label={`${data.checked_in} av ${data.on_apl} incheckade`}
            />
            <ul className={styles.classList}>
              {classes.map((cls) => (
                <li key={cls.id}>
                  <Link to="/attendance" className={styles.classLink}>
                    {cls.name}
                  </Link>
                  <span className={styles.classRatio}>
                    {cls.checked_in}/{cls.on_apl}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  )
}
