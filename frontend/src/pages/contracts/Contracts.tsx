import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { displayOrder, statusText, useContracts, type Contract } from '../../api/contracts'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, matches, SearchInput } from '../../components'
import styles from './Contracts.module.css'
import { NewContractDialog } from './NewContractDialog'
import { SignerDots } from './SignerDots'

type Show = 'waiting' | 'signed' | 'all'

function shortDate(iso: string) {
  const date = new Date(iso)
  if (date.toDateString() === new Date().toDateString()) return 'I dag'
  return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

/**
 * Kontrakt (B8/F9) enligt skissen "Firstflow – Kontrakt skiss" (Texas, 2026-10-29). Läraren ser
 * sina kontrakt och skapar nya. Eleven och handledaren ser kontrakten de ska signera.
 */
export function Contracts() {
  const { data: user } = useCurrentUser()
  const isTeacher = user?.role === 'teacher'
  const enabled = user?.role === 'teacher' || user?.role === 'supervisor' || user?.role === 'student'
  const query = useContracts(enabled)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [show, setShow] = useState<Show>('waiting')
  const [creating, setCreating] = useState(false)

  if (!enabled) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Kontrakt</h1>
        <p className={styles.subtitle}>Skolans ledning får se kontrakten i ett senare steg.</p>
      </div>
    )
  }

  const contracts = query.data ?? []
  // Utkast räknas som väntande: de är inte klara.
  const waiting = contracts.filter((c) => c.status !== 'signed')
  const signed = contracts.filter((c) => c.status === 'signed')
  const visible = (show === 'waiting' ? waiting : show === 'signed' ? signed : contracts).filter(
    (c) =>
      (matches(c.student.name, search) ||
        matches(c.student.email, search) ||
        (c.workplace != null && matches(c.workplace.name, search)) ||
        c.signers.some((s) => matches(s.person.name, search))) &&
      (!from || (c.sent_at ?? c.created_at).slice(0, 10) >= from),
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Kontrakt</h1>
          <p className={styles.subtitle}>
            {isTeacher
              ? 'Utbildningskontrakt för APL. Skicka ut, följ signeringen och ladda ner.'
              : 'Kontrakt som du är part i. Läs avtalet och signera.'}
          </p>
        </div>
        {isTeacher && (
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setCreating(true)}>
            Nytt kontrakt
          </Button>
        )}
      </header>

      <div className={styles.filters}>
        <div className={styles.search}>
          <SearchInput
            label="Sök elev, e-post eller företag"
            placeholder="Sök elev, e-post eller företag"
            value={search}
            onChange={setSearch}
          />
        </div>
        <label className={styles.dateFilter}>
          Skickat från
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <div role="group" aria-label="Visa" className={styles.segments}>
          {(
            [
              ['waiting', 'Väntar', waiting.length],
              ['signed', 'Klara', signed.length],
              ['all', 'Alla', null],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              className={styles.segment}
              aria-pressed={show === value}
              onClick={() => setShow(value)}
            >
              {label}
              {count !== null && <span>{count}</span>}
            </button>
          ))}
        </div>
      </div>

      {query.isPending && <p className={styles.state}>Laddar kontrakt…</p>}
      {query.isError && <p className={styles.state}>Kontrakten gick inte att hämta. Ladda om sidan.</p>}
      {query.isSuccess && contracts.length === 0 && (
        <p className={styles.emptyBox}>
          {isTeacher
            ? 'Inga kontrakt än. Ladda upp ett avtal som PDF och skicka det för signering.'
            : 'Du har inga kontrakt att signera.'}
        </p>
      )}
      {query.isSuccess && contracts.length > 0 && visible.length === 0 && (
        <p className={styles.emptyBox}>Inga kontrakt matchar.</p>
      )}

      {visible.length > 0 && (
        <div className={styles.table} role="table" aria-label="Kontrakt">
          <div className={styles.headRow} role="row">
            <span role="columnheader">Elev</span>
            <span role="columnheader">Företag och handledare</span>
            <span role="columnheader">Signeringar</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className={styles.right}>
              Skickat
            </span>
          </div>
          {visible.map((contract) => (
            <ContractRow key={contract.id} contract={contract} />
          ))}
        </div>
      )}
      {visible.length > 0 && (
        <p className={styles.legend}>E = elev, L = lärare, H = handledare. Grön = signerat, streckad = väntar.</p>
      )}

      {creating && <NewContractDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

function ContractRow({ contract }: { contract: Contract }) {
  const supervisor = contract.signers.find((s) => s.role === 'supervisor')
  const tone = contract.status === 'signed' ? 'done' : contract.status === 'draft' ? 'draft' : 'waiting'
  return (
    <Link to={`/contracts/${contract.id}`} className={styles.row} role="row">
      <span role="cell" className={styles.student}>
        <Avatar name={contract.student.name} size="sm" />
        <span className={styles.studentText}>
          <span className={styles.name}>{contract.student.name}</span>
          <span className={styles.muted}>{contract.student.email}</span>
        </span>
      </span>
      <span role="cell" className={styles.company}>
        {contract.workplace?.name ?? 'Inget företag'}
        {supervisor && <span className={styles.muted}>{supervisor.person.name}</span>}
      </span>
      <span role="cell">
        <SignerDots signers={displayOrder(contract.signers)} />
      </span>
      <span role="cell">
        <span className={styles.status} data-tone={tone}>
          {contract.my_turn ? 'Väntar på dig' : statusText(contract)}
        </span>
      </span>
      <span role="cell" className={`${styles.right} ${styles.muted}`}>
        {contract.sent_at ? shortDate(contract.sent_at) : 'Ej skickat'}
      </span>
    </Link>
  )
}
