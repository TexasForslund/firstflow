import { useState } from 'react'
import { Link } from 'react-router'

import { useRemind } from '../../api/contracts'
import { waitingText, type AttentionItem } from '../../api/overview'
import { Avatar } from '../../components'
import styles from './AttentionTabs.module.css'

type Reason = AttentionItem['reason']

/** Flikarna i den ordning de visas. Flikar utan något att följa upp döljs. */
const TABS: { reason: Reason; label: string; tone: 'sky' | 'butter' | 'primary' | 'mint' }[] = [
  { reason: 'missing_check_ins', label: 'Närvaro', tone: 'sky' },
  { reason: 'missing_reports', label: 'Redovisningar', tone: 'butter' },
  { reason: 'unsigned_contract', label: 'Kontrakt', tone: 'primary' },
  { reason: 'no_placement', label: 'Praktikplats', tone: 'mint' },
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
  }
}

/**
 * "Behöver uppmärksamhet" med en flik per typ: närvaro, redovisningar, kontrakt och
 * praktikplats. Varje rad har en åtgärd, t.ex. Påminn på kontrakt (Texas skiss C, 2026-10-29).
 */
export function AttentionTabs({ items }: { items: AttentionItem[] }) {
  const tabs = TABS.map((tab) => ({ ...tab, items: items.filter((i) => i.reason === tab.reason) })).filter(
    (tab) => tab.items.length > 0,
  )
  const [chosen, setChosen] = useState<Reason | null>(null)
  const [showAll, setShowAll] = useState(false)
  const active = tabs.find((t) => t.reason === chosen) ?? tabs[0]

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
                key={tab.reason}
                type="button"
                className={styles.tab}
                aria-pressed={tab.reason === active?.reason}
                onClick={() => {
                  setChosen(tab.reason)
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
