import { BriefcaseBusiness, CalendarDays, ChevronRight, FileSignature, FolderKanban, MapPin } from 'lucide-react'
import { Link } from 'react-router'

import { statusText, useContracts } from '../../api/contracts'
import { useMyProjects } from '../../api/projects'
import { useMyPlacements, type MyPlacement } from '../../api/placements'
import { Avatar } from '../../components'
import { periodCountdown, periodProgress, periodStatus, periodText, periodWeek, todayIso } from '../placements/period'
import styles from './MyApl.module.css'

/** Elevens praktikplats: arbetsplats, period och handledare. Mobilen först. */
export function MyApl() {
  const placements = useMyPlacements()
  const today = todayIso()
  const items = placements.data ?? []
  const active = items.find((p) => periodStatus(p.start_date, p.end_date, today) === 'active')
  const upcoming = items.filter((p) => periodStatus(p.start_date, p.end_date, today) === 'upcoming')
  const ended = items.filter((p) => periodStatus(p.start_date, p.end_date, today) === 'ended').reverse()
  // Utan pågående placering visas den närmaste kommande som huvudkort.
  const main = active ?? upcoming[0]
  const later = active ? upcoming : upcoming.slice(1)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Min APL</h1>
      </header>

      {placements.isPending && <p className={styles.state}>Laddar…</p>}
      {placements.isError && <p className={styles.state}>Praktikplatsen gick inte att hämta. Ladda om sidan.</p>}

      {placements.isSuccess && items.length === 0 && (
        <div className={styles.empty}>
          <BriefcaseBusiness aria-hidden="true" />
          <p className={styles.emptyTitle}>Du har ingen praktikplats ännu</p>
          <p className={styles.emptyText}>Din lärare lägger in var du ska göra din APL. Den visas här sedan.</p>
        </div>
      )}

      <MyContracts />
      <MyProjects />

      {main && <CurrentPlacement placement={main} today={today} />}

      {later.length > 0 && <PlacementList title="Kommande" items={later} />}
      {ended.length > 0 && <PlacementList title="Tidigare" items={ended} />}
    </div>
  )
}

/** Elevens pågående projekt (B12). Redovisningar kan kopplas till dem. */
function MyProjects() {
  const projects = useMyProjects()
  const items = projects.data ?? []
  if (items.length === 0) return null
  return (
    <section className={styles.card} aria-labelledby="projects-title">
      <h2 id="projects-title" className={styles.cardTitle}>
        Mina projekt
      </h2>
      <ul className={styles.contracts}>
        {items.map((p) => (
          <li key={p.id}>
            <Link to={`/my-projects/${p.id}`} className={styles.project}>
              <FolderKanban aria-hidden="true" />
              <span className={styles.contractText}>
                <span className={styles.contractTitle}>{p.name}</span>
                <span className={styles.contractMeta}>
                  {[
                    p.workplace?.name,
                    p.deadline &&
                      `klart ${new Date(`${p.deadline}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Inget slutdatum'}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className={styles.projectChevron} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Elevens kontrakt. Ett kontrakt som väntar på eleven visas överst med Läs och signera. */
function MyContracts() {
  const contracts = useContracts()
  const items = contracts.data ?? []
  if (items.length === 0) return null
  return (
    <section className={styles.card} aria-labelledby="contracts-title">
      <h2 id="contracts-title" className={styles.cardTitle}>
        Kontrakt
      </h2>
      <ul className={styles.contracts}>
        {items.map((c) => (
          <li key={c.id}>
            <Link to={`/contracts/${c.id}`} className={styles.contract} data-turn={c.my_turn ? '' : undefined}>
              <FileSignature aria-hidden="true" />
              <span className={styles.contractText}>
                <span className={styles.contractTitle}>{c.my_turn ? 'Läs och signera ditt kontrakt' : c.title}</span>
                <span className={styles.contractMeta}>
                  {c.workplace?.name}
                  {c.workplace && ' · '}
                  {c.my_turn ? 'Väntar på dig' : statusText(c)}
                </span>
              </span>
              <ChevronRight aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CurrentPlacement({ placement, today }: { placement: MyPlacement; today: string }) {
  const { start_date: start, end_date: end } = placement
  const status = periodStatus(start, end, today)
  const { week, weeks } = periodWeek(start, end, today)
  const progress = periodProgress(start, end, today)

  return (
    <>
      <section className={styles.current} aria-labelledby="current-workplace">
        <p className={styles.eyebrow}>{status === 'active' ? 'Din APL just nu' : 'Din nästa APL'}</p>
        <h2 id="current-workplace" className={styles.workplace}>
          {placement.workplace.name}
        </h2>
        {placement.workplace.address && (
          <p className={styles.line}>
            <MapPin aria-hidden="true" />
            {placement.workplace.address}
          </p>
        )}
        <p className={styles.line}>
          <CalendarDays aria-hidden="true" />
          {periodText(start, end)}
        </p>

        <div className={styles.progressBlock}>
          <div className={styles.progressText}>
            <span>
              {status === 'active' ? `Vecka ${week} av ${weeks}` : `${weeks} ${weeks === 1 ? 'vecka' : 'veckor'}`}
            </span>
            <span>{periodCountdown(start, end, today)}</span>
          </div>
          {status === 'active' && (
            <div
              className={styles.track}
              role="progressbar"
              aria-label="Hur långt du har kommit i perioden"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <span className={styles.fill} style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
      </section>

      <section className={styles.card} aria-labelledby="supervisor-title">
        <h2 id="supervisor-title" className={styles.cardTitle}>
          Din handledare
        </h2>
        <div className={styles.person}>
          <Avatar name={placement.supervisor_name} />
          <span className={styles.personText}>
            <span className={styles.personName}>{placement.supervisor_name}</span>
            <span className={styles.personMeta}>{placement.workplace.name}</span>
          </span>
        </div>
      </section>
    </>
  )
}

function PlacementList({ title, items }: { title: string; items: MyPlacement[] }) {
  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <ul className={styles.list}>
        {items.map((p) => (
          <li key={p.id} className={styles.listItem}>
            <span className={styles.personName}>{p.workplace.name}</span>
            <span className={styles.personMeta}>
              {periodText(p.start_date, p.end_date)} · {p.supervisor_name}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
