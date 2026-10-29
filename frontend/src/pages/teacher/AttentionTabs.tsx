import { useState } from 'react'
import { Link } from 'react-router'

import { useRemind } from '../../api/contracts'
import { waitingText, type AttentionItem } from '../../api/overview'
import { Avatar } from '../../components'
import styles from './AttentionTabs.module.css'

type Reason = AttentionItem['reason']

/** Flikarna i den ordning de visas. Flikar utan något att följa upp döljs. */
const TABS: { id: string; reasons: Reason[]; label: string; tone: 'sky' | 'butter' | 'primary' | 'mint' }[] = [
  {
    id: 'attendance',
    reasons: ['attendance_conflict', 'missing_check_ins', 'unconfirmed_days'],
    label: 'Närvaro',
    tone: 'sky',
  },
  { id: 'reports', reasons: ['missing_reports'], label: 'Redovisningar', tone: 'butter' },
  { id: 'contracts', reasons: ['unsigned_contract'], label: 'Kontrakt', tone: 'primary' },
  { id: 'placement', reasons: ['no_placement'], label: 'Praktikplats', tone: 'mint' },
]

/** Hur många rader som visas innan "Visa alla". */
const SHOWN = 6

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function sentText(days: number) {
  if (days <= 0) return 'skickat i dag'
  if (days === 1) return 'skickat i går'
  return `skickat för ${days} dagar sedan`
}

function describe(item: AttentionItem) {
  switch (item.reason) {
    case 'missing_check_ins':
      return `${plural(item.count, 'dag', 'dagar')} ej incheckad de senaste fyra veckorna`
    case 'missing_reports':
      return `${plural(item.count, 'redovisning', 'redovisningar')} saknas`
    case 'unsigned_contract':
      return `Väntar på ${waitingText(item)} · ${sentText(item.count)}`
    case 'no_placement':
      return 'Har ingen praktikplats'
    case 'unconfirmed_days':
      return `${plural(item.count, 'dag', 'dagar')} väntar på handledarens bekräftelse`
    case 'attendance_conflict':
      return `Incheckad ${plural(item.count, 'dag', 'dagar')}, men handledaren säger inte på plats`
  }
}

/**
 * "Behöver uppmärksamhet" med en flik per typ: närvaro, redovisningar, kontrakt och
 * praktikplats. Varje rad har en åtgärd, t.ex. Påminn på kontrakt (Texas skiss C, 2026-10-29).
 */
export function AttentionTabs({ items }: { items: AttentionItem[] }) {
  const tabs = TABS.map((tab) => ({
    ...tab,
    // I fliken visas punkterna i den ordning listan har, viktigast först.
    items: items.filter((i) => tab.reasons.includes(i.reason)),
  })).filter((tab) => tab.items.length > 0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const active = tabs.find((t) => t.id === chosen) ?? tabs[0]

  return (
    <section className={styles.card} aria-labelledby="attention-heading">
      <div className={styles.head}>
        <h2 id="attention-heading" className={styles.title}>
          Behöver uppmärksamhet
        </h2>
        {tabs.length === 0 ? (
          <p className={styles.empty}>Inget att följa upp just nu.</p>
        ) : (
          <div className={styles.tabs} role="group" aria-label="Typ">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={styles.tab}
                aria-pressed={tab.id === active?.id}
                onClick={() => {
                  setChosen(tab.id)
                  setShowAll(false)
                }}
              >
                {tab.label}
                <span className={styles.count} data-tone={tab.tone}>
                  {tab.items.length}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {active && (
        <>
          <ul className={styles.list} aria-label={active.label}>
            {(showAll ? active.items : active.items.slice(0, SHOWN)).map((item) => (
              <Row key={item.contract_id ?? `${item.student.id}-${item.reason}`} item={item} />
            ))}
          </ul>
          {active.items.length > SHOWN && (
            <button type="button" className={styles.showAll} onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Visa färre' : `Visa alla ${active.items.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function Row({ item }: { item: AttentionItem }) {
  const to = item.contract_id ? `/contracts/${item.contract_id}` : `/students/${item.student.id}`
  return (
    <li className={styles.row}>
      <Avatar name={item.student.name} />
      <span className={styles.text}>
        <span className={styles.name}>
          {item.student.name} <span className={styles.className}>{item.class_name}</span>
        </span>
        <span className={styles.reason}>{describe(item)}</span>
      </span>
      <span className={styles.actions}>
        {item.contract_id && <RemindButton contractId={item.contract_id} />}
        <Link to={to} className={styles.open} aria-label={`Öppna ${item.student.name}`}>
          Öppna
        </Link>
      </span>
    </li>
  )
}

function RemindButton({ contractId }: { contractId: string }) {
  const remind = useRemind(contractId)
  return (
    <button
      type="button"
      className={styles.remind}
      disabled={remind.isPending || remind.isSuccess}
      onClick={() => remind.mutate()}
    >
      {remind.isSuccess ? 'Påmind' : remind.isError ? 'Försök igen' : 'Påminn'}
    </button>
  )
}
