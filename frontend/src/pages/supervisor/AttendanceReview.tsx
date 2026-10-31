import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'

import { clockTime, useReview, useReviewList, type ReviewItem, type ReviewVerdict } from '../../api/attendance'
import { Avatar } from '../../components'
import styles from './AttendanceReview.module.css'

type Verdict = ReviewVerdict['verdict']
type Send = (items: ReviewVerdict[]) => void

function longDay(iso: string) {
  const text = new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "Fre 30 okt". */
function shortDay(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  const weekday = d.toLocaleDateString('sv-SE', { weekday: 'short' })
  const month = d.toLocaleDateString('sv-SE', { month: 'short' })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${d.getDate()} ${month}`
}

/** "Ons". */
function weekdayShort(iso: string) {
  const text = new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'short' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function key(item: { placement_id: string; date: string }) {
  return `${item.placement_id}:${item.date}`
}

function verdict(item: ReviewItem, v: Verdict): ReviewVerdict {
  return { placement_id: item.placement_id, date: item.date, verdict: v }
}

/** Grupperar i ordning, t.ex. per elev eller företag. */
function groupBy<T>(items: T[], by: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(by(item), [...(groups.get(by(item)) ?? []), item])
  return [...groups]
}

/**
 * Handledaren bekräftar närvaron (Texas, skiss A 2026-10-31). Handledaren gör bara något när
 * något avviker: incheckningar bekräftas med ett tryck eller alla på en gång, och en dag utan
 * incheckning räknas som frånvaro tills handledaren säger att eleven var där.
 */
export function AttendanceReview() {
  const query = useReviewList()
  const review = useReview()

  if (query.isPending) return <p className={styles.state}>Laddar närvaron…</p>
  if (query.isError) return <p className={styles.state}>Närvaron gick inte att hämta. Ladda om sidan.</p>

  const { today, today_items: todayItems, earlier, this_week: week } = query.data
  const waiting = earlier.filter((i) => i.state === 'pending')
  const missing = week.filter((i) => i.state === 'missing')
  const done = week.filter((i) => i.state === 'confirmed' || i.state === 'not_present')
  const send: Send = (items) => review.mutate(items)
  const busy = review.isPending

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Närvaro</h1>
        <p className={styles.subtitle}>
          {longDay(today)}
          {todayItems.length === 0 && ' · ingen har APL i dag'}
        </p>
      </header>

      {review.isError && (
        <p className={styles.error} role="alert">
          {review.error.message}
        </p>
      )}

      {todayItems.length > 0 && (
        <section className={styles.section} aria-labelledby="today-title">
          <h2 id="today-title" className={styles.sectionTitle}>
            I dag
          </h2>
          {todayItems.map((item) => (
            <TodayCard key={key(item)} item={item} busy={busy} onSend={send} />
          ))}
        </section>
      )}

      <Waiting items={waiting} busy={busy} onSend={send} />

      {missing.length > 0 && (
        <section className={styles.section} aria-labelledby="missing-title">
          <div>
            <h2 id="missing-title" className={styles.sectionTitle}>
              Ingen incheckning den här veckan
            </h2>
            <p className={styles.muted}>
              Räknas som frånvaro. Du behöver bara göra något om eleven var här men glömde checka in.
            </p>
          </div>
          <ul className={styles.list}>
            {groupBy(missing, (i) => i.placement_id).map(([id, days]) => (
              <StudentDays key={id} days={days} mode="missing" busy={busy} onSend={send} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className={styles.section} aria-labelledby="done-title">
          <h2 id="done-title" className={styles.doneTitle}>
            Klart den här veckan
          </h2>
          <ul className={styles.list}>
            {groupBy(done, (i) => i.placement_id).map(([id, days]) => (
              <StudentDays key={id} days={days} mode="done" busy={busy} onSend={send} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ConfirmButton({ label = 'Bekräfta', ...props }: { label?: string } & React.ComponentProps<'button'>) {
  return (
    <button type="button" className={styles.confirm} {...props}>
      <Check aria-hidden="true" /> {label}
    </button>
  )
}

function NotPresentButton({ label = 'Inte på plats', ...props }: { label?: string } & React.ComponentProps<'button'>) {
  return (
    <button type="button" className={styles.notPresent} {...props}>
      <X aria-hidden="true" /> {label}
    </button>
  )
}

function TodayCard({ item, busy, onSend }: { item: ReviewItem; busy: boolean; onSend: Send }) {
  const time = item.checked_in_at ? clockTime(item.checked_in_at) : null
  const status = {
    pending: `Checkade in ${time}`,
    missing: 'Har inte checkat in',
    confirmed: time ? `Bekräftad · in ${time}` : 'Bekräftad · du lade till dagen',
    not_present: time ? `Inte på plats · checkade in ${time}` : 'Inte på plats',
  }[item.state]
  const send = (v: Verdict) => onSend([verdict(item, v)])

  return (
    <article className={styles.card}>
      <div className={styles.person}>
        <Avatar name={item.student.name} />
        <span className={styles.personText}>
          <span className={styles.name}>{item.student.name}</span>
          <span className={styles.status} data-state={item.state}>
            {status}
          </span>
        </span>
      </div>
      {item.state === 'pending' ? (
        <div className={styles.actions}>
          <NotPresentButton disabled={busy} onClick={() => send('not_present')} />
          <ConfirmButton disabled={busy} onClick={() => send('confirmed')} />
        </div>
      ) : item.state === 'missing' ? (
        <div className={styles.actions}>
          <button type="button" className={styles.add} disabled={busy} onClick={() => send('confirmed')}>
            <Plus aria-hidden="true" /> Var här ändå
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.link}
          disabled={busy}
          onClick={() => send(item.state === 'confirmed' ? 'not_present' : 'confirmed')}
        >
          {item.state === 'confirmed' ? 'Ändra till inte på plats' : 'Ändra till på plats'}
        </button>
      )}
    </article>
  )
}

function Waiting({ items, busy, onSend }: { items: ReviewItem[]; busy: boolean; onSend: Send }) {
  const companies = groupBy(items, (i) => i.workplace_name)
  return (
    <section className={styles.section} aria-labelledby="waiting-title">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="waiting-title" className={styles.sectionTitle}>
            Att bekräfta {items.length > 0 && <span className={styles.count}>{items.length}</span>}
          </h2>
          <p className={styles.muted}>
            {items.length > 0
              ? 'Eleverna checkade in. Stämmer det? Bekräfta alla, eller ta bort någon som inte var där.'
              : 'Allt är bekräftat. Bra jobbat!'}
          </p>
        </div>
        {items.length > 1 && (
          <button
            type="button"
            className={styles.confirmAll}
            disabled={busy}
            onClick={() => onSend(items.map((i) => verdict(i, 'confirmed')))}
          >
            <Check aria-hidden="true" /> Bekräfta alla {items.length}
          </button>
        )}
      </div>
      {items.length > 0 && (
        <ul className={styles.list}>
          {companies.map(([company, rows]) => (
            <li key={company}>
              {companies.length > 1 && <h3 className={styles.company}>{company}</h3>}
              <ul>
                {rows.map((item) => (
                  <li key={key(item)} className={styles.row}>
                    <Avatar name={item.student.name} />
                    <span className={styles.personText}>
                      <span className={styles.name}>{item.student.name}</span>
                      <span className={styles.muted}>
                        {shortDay(item.date)} · checkade in {item.checked_in_at ? clockTime(item.checked_in_at) : ''}
                      </span>
                    </span>
                    <span className={styles.rowActions}>
                      <NotPresentButton
                        disabled={busy}
                        aria-label={`Inte på plats: ${item.student.name}, ${shortDay(item.date)}`}
                        onClick={() => onSend([verdict(item, 'not_present')])}
                      />
                      <ConfirmButton
                        disabled={busy}
                        aria-label={`Bekräfta ${item.student.name}, ${shortDay(item.date)}`}
                        onClick={() => onSend([verdict(item, 'confirmed')])}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * En elev med veckans dagar. Saknade dagar: "Var här en dag" fäller ut dagarna att lägga till.
 * Klara dagar: "Ändra" fäller ut dagarna med Var här och Inte här.
 */
function StudentDays({
  days,
  mode,
  busy,
  onSend,
}: {
  days: ReviewItem[]
  mode: 'missing' | 'done'
  busy: boolean
  onSend: Send
}) {
  const [open, setOpen] = useState(false)
  const student = days[0].student
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const panelId = `days-${days[0].placement_id}-${mode}`

  return (
    <li className={styles.studentRow}>
      <div className={styles.studentHead}>
        <Avatar name={student.name} size={mode === 'done' ? 'sm' : undefined} />
        <span className={styles.personText}>
          <span className={styles.name}>{student.name}</span>
          <span className={styles.chips}>
            {ordered.map((d) => (
              <span key={d.date} className={styles.dayChip} data-state={d.state}>
                {d.state === 'confirmed' && <Check aria-hidden="true" />}
                {d.state === 'not_present' && <X aria-hidden="true" />}
                {weekdayShort(d.date)}
                <span className="sr-only">
                  {d.state === 'confirmed'
                    ? ' på plats'
                    : d.state === 'not_present'
                      ? ' inte på plats'
                      : ' ingen incheckning'}
                </span>
              </span>
            ))}
          </span>
        </span>
        <button
          type="button"
          className={mode === 'missing' ? styles.add : styles.link}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          {mode === 'missing' && <Plus aria-hidden="true" />}
          {mode === 'missing' ? 'Var här en dag' : open ? 'Klar' : 'Ändra'}
        </button>
      </div>
      {open && (
        <ul id={panelId} className={styles.dayList}>
          {ordered.map((d) => (
            <li key={d.date} className={styles.dayRow}>
              <span>{shortDay(d.date)}</span>
              <span className={styles.rowActions}>
                {mode === 'done' && (
                  <NotPresentButton
                    label="Inte här"
                    aria-pressed={d.state === 'not_present'}
                    disabled={busy || d.state === 'not_present'}
                    onClick={() => onSend([verdict(d, 'not_present')])}
                  />
                )}
                <ConfirmButton
                  label="Var här"
                  aria-pressed={d.state === 'confirmed'}
                  disabled={busy || d.state === 'confirmed'}
                  onClick={() => onSend([verdict(d, 'confirmed')])}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
