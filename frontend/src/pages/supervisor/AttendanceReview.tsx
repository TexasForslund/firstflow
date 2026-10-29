import { useState } from 'react'

import { clockTime, useReview, useReviewList, type ReviewItem, type ReviewVerdict } from '../../api/attendance'
import { Avatar, Button } from '../../components'
import { DayMark } from '../teacher/DayMark'
import styles from './AttendanceReview.module.css'

function weekday(iso: string) {
  const text = new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function key(item: { placement_id: string; date: string }) {
  return `${item.placement_id}:${item.date}`
}

/**
 * Handledaren bekräftar närvaron (Texas, 2026-10-29). I dag överst med Bekräfta och Inte på
 * plats. Under det dagar som väntar från tidigare, upp till två veckor bakåt, som kan
 * bekräftas flera åt gången.
 */
export function AttendanceReview() {
  const query = useReviewList()
  const review = useReview()

  if (query.isPending) return <p className={styles.state}>Laddar närvaron…</p>
  if (query.isError) return <p className={styles.state}>Närvaron gick inte att hämta. Ladda om sidan.</p>

  const { today_items: today, earlier } = query.data
  const workplaces = [...new Set([...today, ...earlier].map((i) => i.workplace_name))]

  function send(items: ReviewVerdict[]) {
    review.mutate(items)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Bekräfta närvaro</h1>
        {workplaces.length > 0 && <p className={styles.subtitle}>{workplaces.join(', ')}</p>}
      </header>

      {review.isError && (
        <p className={styles.error} role="alert">
          {review.error.message}
        </p>
      )}

      <section className={styles.section} aria-labelledby="today-title">
        <h2 id="today-title" className={styles.sectionTitle}>
          I dag
        </h2>
        {today.length === 0 && <p className={styles.empty}>Ingen av dina elever har APL i dag.</p>}
        {today.map((item) => (
          <TodayCard key={key(item)} item={item} busy={review.isPending} onSend={send} />
        ))}
      </section>

      <Earlier items={earlier} busy={review.isPending} onSend={send} />
    </div>
  )
}

function TodayCard({
  item,
  busy,
  onSend,
}: {
  item: ReviewItem
  busy: boolean
  onSend: (items: ReviewVerdict[]) => void
}) {
  const verdict = (v: ReviewVerdict['verdict']) =>
    onSend([{ placement_id: item.placement_id, date: item.date, verdict: v }])
  const time = item.checked_in_at ? clockTime(item.checked_in_at) : null
  const status = {
    pending: `Checkade in ${time}`,
    missing: 'Har inte checkat in',
    confirmed: time ? `Bekräftad · in ${time}` : 'Bekräftad · du lade till dagen',
    not_present: time ? `Inte på plats · checkade in ${time}` : 'Inte på plats',
  }[item.state]

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
        {(item.state === 'confirmed' || item.state === 'not_present') && (
          <DayMark state={item.state} checkedInAt={item.checked_in_at} />
        )}
      </div>
      {item.state === 'pending' || item.state === 'missing' ? (
        <div className={styles.actions}>
          <Button disabled={busy} onClick={() => verdict('not_present')}>
            Inte på plats
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => verdict('confirmed')}>
            {item.state === 'missing' ? 'Var här ändå' : 'Bekräfta'}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.change}
          disabled={busy}
          onClick={() => verdict(item.state === 'confirmed' ? 'not_present' : 'confirmed')}
        >
          {item.state === 'confirmed' ? 'Ändra till inte på plats' : 'Ändra till på plats'}
        </button>
      )}
    </article>
  )
}

function Earlier({
  items,
  busy,
  onSend,
}: {
  items: ReviewItem[]
  busy: boolean
  onSend: (items: ReviewVerdict[]) => void
}) {
  // Incheckningar är förvalda. Dagar utan incheckning kryssar handledaren i själv.
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const [checkedMissing, setCheckedMissing] = useState<Set<string>>(new Set())
  const isChecked = (item: ReviewItem) =>
    item.state === 'pending' ? !unchecked.has(key(item)) : checkedMissing.has(key(item))

  function toggle(item: ReviewItem) {
    const set = item.state === 'pending' ? new Set(unchecked) : new Set(checkedMissing)
    if (set.has(key(item))) set.delete(key(item))
    else set.add(key(item))
    if (item.state === 'pending') setUnchecked(set)
    else setCheckedMissing(set)
  }

  const chosen = items.filter(isChecked)
  const pending = items.filter((i) => i.state === 'pending').length

  return (
    <section className={styles.section} aria-labelledby="earlier-title">
      <div className={styles.sectionHead}>
        <h2 id="earlier-title" className={styles.sectionTitle}>
          Tidigare dagar
        </h2>
        <span className={styles.muted}>{pending > 0 ? `${pending} väntar` : 'Allt är bekräftat'}</span>
      </div>
      <p className={styles.muted}>
        Incheckningar som väntar, och dagar i veckan utan incheckning om eleven glömde. Två veckor bakåt.
      </p>
      {items.length > 0 && (
        <>
          {[...new Set(items.map((i) => i.date))].map((date) => (
            <div key={date} className={styles.day}>
              <h3 className={styles.dayTitle}>{weekday(date)}</h3>
              <ul className={styles.list}>
                {items
                  .filter((i) => i.date === date)
                  .map((item) => (
                    <li key={key(item)} className={styles.row}>
                      <label className={styles.check}>
                        <input type="checkbox" checked={isChecked(item)} onChange={() => toggle(item)} />
                        <span className={styles.personText}>
                          <span className={styles.name}>{item.student.name}</span>
                          <span className={styles.muted}>
                            {item.checked_in_at ? `Checkade in ${clockTime(item.checked_in_at)}` : 'Ingen incheckning'}
                          </span>
                        </span>
                      </label>
                      <button
                        type="button"
                        className={styles.change}
                        disabled={busy}
                        onClick={() =>
                          onSend([{ placement_id: item.placement_id, date: item.date, verdict: 'not_present' }])
                        }
                      >
                        Inte på plats
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <Button
            variant="primary"
            className={styles.confirmAll}
            disabled={busy || chosen.length === 0}
            onClick={() =>
              onSend(chosen.map((i) => ({ placement_id: i.placement_id, date: i.date, verdict: 'confirmed' })))
            }
          >
            Bekräfta valda ({chosen.length})
          </Button>
        </>
      )}
    </section>
  )
}
