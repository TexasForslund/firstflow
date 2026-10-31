import { Check, ChevronRight, FileSignature } from 'lucide-react'
import { Link } from 'react-router'

import { displayOrder, roleLabel, useContracts, type Contract, type Signer } from '../../api/contracts'
import styles from './StudentContracts.module.css'

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

/** När kontraktet blev klart: den sista signeringen. */
function signedDate(contract: Contract) {
  const dates = contract.signers.map((s) => s.signed_at).filter((d): d is string => d != null)
  return dates.sort().at(-1)
}

/**
 * Elevens kontrakt (Texas, 2026-10-29). Eleven ser bara sina egna kontrakt, så här finns
 * inget sökfält eller filter. Kontrakt som väntar visas som kort, signerade i en lista under.
 */
export function StudentContracts() {
  const query = useContracts(true)
  const contracts = query.data ?? []
  // Utkast skickas inte till eleven, men räknas som väntande om de skulle dyka upp.
  const waiting = contracts.filter((c) => c.status !== 'signed')
  const signed = contracts.filter((c) => c.status === 'signed')

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Mina kontrakt</h1>
        <p className={styles.subtitle}>Läs kontraktet och signera.</p>
      </header>

      {query.isPending && <p className={styles.state}>Laddar kontrakt…</p>}
      {query.isError && <p className={styles.state}>Kontrakten gick inte att hämta. Ladda om sidan.</p>}
      {query.isSuccess && contracts.length === 0 && (
        <p className={styles.empty}>Du har inga kontrakt än. Din lärare skickar dem hit.</p>
      )}

      {waiting.map((contract) => (
        <WaitingCard key={contract.id} contract={contract} />
      ))}

      {signed.length > 0 && (
        <section className={styles.signed} aria-labelledby="signed-heading">
          <h2 id="signed-heading" className={styles.sectionTitle}>
            Signerade
          </h2>
          <ul className={styles.list}>
            {signed.map((contract) => {
              const date = signedDate(contract)
              return (
                <li key={contract.id}>
                  <Link to={`/contracts/${contract.id}`} className={styles.listRow}>
                    <span className={styles.listText}>
                      <span className={styles.name}>{contract.workplace?.name ?? contract.title}</span>
                      <span className={styles.muted}>Klart{date ? ` ${shortDate(date)}` : ''}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className={styles.chevron} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function WaitingCard({ contract }: { contract: Contract }) {
  const supervisor = contract.signers.find((s) => s.role === 'supervisor')
  const others = contract.signers.filter((s) => !s.signed_at && s.role !== 'student')
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.icon} aria-hidden="true">
          <FileSignature />
        </span>
        <span className={styles.cardText}>
          <span className={styles.company}>{contract.workplace?.name ?? contract.title}</span>
          {supervisor && <span className={styles.muted}>Handledare: {supervisor.person.name}</span>}
          {contract.sent_at && <span className={styles.muted}>Skickat {shortDate(contract.sent_at)}</span>}
        </span>
      </div>

      <ul className={styles.signers} aria-label="Signeringar">
        {displayOrder(contract.signers).map((s) => (
          <SignerChip key={s.role} signer={s} />
        ))}
      </ul>

      {contract.my_turn ? (
        <Link to={`/contracts/${contract.id}`} className={styles.primary}>
          Läs och signera
        </Link>
      ) : (
        <Link to={`/contracts/${contract.id}`} className={styles.secondary}>
          {others.length > 0
            ? `Väntar på ${others.map((s) => roleLabel[s.role].toLowerCase()).join(' och ')}`
            : 'Visa kontraktet'}
          <ChevronRight aria-hidden="true" />
        </Link>
      )}
    </article>
  )
}

function SignerChip({ signer }: { signer: Signer }) {
  const label = signer.role === 'student' ? 'Du' : roleLabel[signer.role]
  const done = signer.signed_at != null
  return (
    <li className={styles.signer} data-signed={done ? '' : undefined}>
      <span className={styles.mark} aria-hidden="true">
        {done && <Check />}
      </span>
      {label}
      <span className="sr-only">{done ? ', har signerat' : ', har inte signerat'}</span>
    </li>
  )
}
