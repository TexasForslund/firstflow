import { Bell, Check, Download, ExternalLink, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import {
  displayOrder,
  pdfUrl,
  roleLabel,
  statusText,
  useContract,
  useDeleteContract,
  useRemind,
  useSendContract,
  useSignContract,
  type ContractDetail,
} from '../../api/contracts'
import { Button } from '../../components'
import styles from './ContractPage.module.css'

function dateTime(iso: string) {
  return new Date(iso).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
}

function period(start: string | null, end: string | null) {
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  return start ? `Från ${fmt(start)}` : end ? `Till ${fmt(end)}` : 'Ingen period angiven'
}

/** Kontraktets sida: PDF:en till vänster, signering, detaljer och händelser till höger. */
export function ContractPage() {
  const { contractId = '' } = useParams()
  const query = useContract(contractId)

  if (query.isPending) return <p className={styles.state}>Laddar kontraktet…</p>
  if (query.isError) {
    return (
      <div className={styles.page}>
        <p className={styles.breadcrumb}>
          <Link to="/contracts">Kontrakt</Link>
        </p>
        <p className={styles.state}>Kontraktet finns inte, eller så har du inte tillgång till det.</p>
      </div>
    )
  }
  return <Contract contract={query.data} />
}

function Contract({ contract }: { contract: ContractDetail }) {
  const tone = contract.status === 'signed' ? 'done' : contract.status === 'draft' ? 'draft' : 'waiting'
  const supervisor = contract.signers.find((s) => s.role === 'supervisor')

  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link to="/contracts">Kontrakt</Link> / {contract.student.name}
      </p>

      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{contract.title}</h1>
          <p className={styles.meta}>
            <span className={styles.status} data-tone={tone}>
              {statusText(contract)}
            </span>
            {contract.sent_at
              ? `Skickat ${day(contract.sent_at)} av ${contract.created_by.name}`
              : `Utkast skapat av ${contract.created_by.name}`}
          </p>
        </div>
        <OwnerActions contract={contract} />
      </header>

      <div className={styles.columns}>
        <section className={styles.document} aria-label="Avtalet">
          <div className={styles.documentBar}>
            <span className={styles.fileName}>{contract.file_name}</span>
            <a href={pdfUrl(contract.id)} target="_blank" rel="noreferrer" className={styles.openLink}>
              Öppna i ny flik <ExternalLink aria-hidden="true" />
            </a>
          </div>
          <iframe title={`Avtalet: ${contract.title}`} src={pdfUrl(contract.id)} className={styles.pdf} />
        </section>

        <div className={styles.side}>
          {contract.my_turn && <SignBox contract={contract} />}

          <section className={styles.box} aria-labelledby="signing-title">
            <h2 id="signing-title" className={styles.boxTitle}>
              Signering
            </h2>
            <ul className={styles.signers}>
              {displayOrder(contract.signers).map((s) => (
                <li key={s.role} className={styles.signer}>
                  <span className={styles.mark} data-signed={s.signed_at ? '' : undefined} aria-hidden="true">
                    {s.signed_at && <Check />}
                  </span>
                  <span className={styles.signerText}>
                    <span className={styles.signerName}>{s.person.name}</span>
                    <span className={styles.muted}>
                      {roleLabel[s.role]}
                      {s.role === 'supervisor' && contract.workplace && ` · ${contract.workplace.name}`}
                      {s.role === 'teacher' && ' · signerar för skolan'}
                    </span>
                  </span>
                  <span
                    className={styles.signerState}
                    data-tone={s.signed_at ? 'done' : s.opened_at ? 'waiting' : undefined}
                  >
                    {s.signed_at
                      ? `Signerat ${day(s.signed_at)}`
                      : !contract.sent_at
                        ? 'Ej skickat'
                        : s.opened_at
                          ? 'Öppnat, ej signerat'
                          : 'Väntar'}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.testNote}>Testläge: signering med knapp. BankID senare.</p>
          </section>

          <section className={styles.box} aria-labelledby="details-title">
            <h2 id="details-title" className={styles.boxTitle}>
              Detaljer
            </h2>
            <dl className={styles.details}>
              <dt>Elev</dt>
              <dd>
                {contract.is_owner ? (
                  <Link to={`/students/${contract.student.id}`}>{contract.student.name}</Link>
                ) : (
                  contract.student.name
                )}
                <br />
                <span className={styles.muted}>{contract.student.email}</span>
              </dd>
              <dt>Företag</dt>
              <dd>{contract.workplace?.name ?? 'Inget företag'}</dd>
              {supervisor && (
                <>
                  <dt>Handledare</dt>
                  <dd>{supervisor.person.name}</dd>
                </>
              )}
              <dt>APL</dt>
              <dd>{period(contract.start_date, contract.end_date)}</dd>
            </dl>
          </section>

          <Events contract={contract} />
        </div>
      </div>
    </div>
  )
}

function SignBox({ contract }: { contract: ContractDetail }) {
  const sign = useSignContract(contract.id)
  const [accepted, setAccepted] = useState(false)
  return (
    <section className={`${styles.box} ${styles.signBox}`} aria-labelledby="sign-title">
      <h2 id="sign-title" className={styles.boxTitle}>
        Väntar på din signatur
      </h2>
      <p className={styles.muted}>Läs avtalet först. Du kan öppna det i en ny flik.</p>
      <label className={styles.accept}>
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        Jag har läst avtalet och godkänner det.
      </label>
      <Button variant="primary" disabled={!accepted || sign.isPending} onClick={() => sign.mutate()}>
        {sign.isPending ? 'Signerar…' : 'Signera (testläge)'}
      </Button>
      {sign.isError && (
        <p className={styles.error} role="alert">
          {sign.error.message}
        </p>
      )}
      <p className={styles.mutedSmall}>Här öppnas BankID när det är kopplat.</p>
    </section>
  )
}

function OwnerActions({ contract }: { contract: ContractDetail }) {
  const navigate = useNavigate()
  const send = useSendContract(contract.id)
  const remind = useRemind(contract.id)
  const remove = useDeleteContract()
  const [confirming, setConfirming] = useState(false)
  const othersSigned = contract.signers.some((s) => s.role !== 'teacher' && s.signed_at)

  return (
    <div className={styles.actions}>
      {contract.is_owner && contract.status === 'waiting' && (
        <Button
          icon={<Bell aria-hidden="true" />}
          disabled={remind.isPending || remind.isSuccess}
          onClick={() => remind.mutate()}
        >
          {remind.isSuccess ? `Påminde ${remind.data.reminded}` : 'Påminn'}
        </Button>
      )}
      {contract.is_owner && contract.status === 'draft' && (
        <Button
          variant="primary"
          icon={<Send aria-hidden="true" />}
          disabled={send.isPending}
          onClick={() => send.mutate()}
        >
          Skicka för signering
        </Button>
      )}
      <a href={pdfUrl(contract.id, true)} className={styles.download}>
        <Download aria-hidden="true" /> Ladda ner PDF
      </a>
      {contract.is_owner && !othersSigned && !confirming && (
        <button type="button" className={styles.deleteButton} onClick={() => setConfirming(true)}>
          <Trash2 aria-hidden="true" /> Ta bort
        </button>
      )}
      {confirming && (
        <span className={styles.confirm}>
          Ta bort kontraktet?
          <button
            type="button"
            className={styles.deleteButton}
            disabled={remove.isPending}
            onClick={() => remove.mutate(contract.id, { onSuccess: () => navigate('/contracts') })}
          >
            Ja, ta bort
          </button>
          <button type="button" className={styles.textButton} onClick={() => setConfirming(false)}>
            Avbryt
          </button>
        </span>
      )}
    </div>
  )
}

function Events({ contract }: { contract: ContractDetail }) {
  const events: { at: string; text: string }[] = []
  const teacher = contract.signers.find((s) => s.role === 'teacher')
  if (contract.sent_at) {
    events.push({ at: contract.sent_at, text: `${contract.created_by.name} signerade och skickade avtalet` })
  } else {
    events.push({ at: contract.created_at, text: `${contract.created_by.name} skapade ett utkast` })
  }
  for (const s of contract.signers) {
    if (s === teacher) continue
    if (s.signed_at) events.push({ at: s.signed_at, text: `${s.person.name} signerade` })
    else if (s.opened_at) events.push({ at: s.opened_at, text: `${s.person.name} öppnade avtalet` })
  }
  events.sort((a, b) => b.at.localeCompare(a.at))

  return (
    <section className={styles.box} aria-labelledby="events-title">
      <h2 id="events-title" className={styles.boxTitle}>
        Händelser
      </h2>
      <ol className={styles.events}>
        {events.map((e) => (
          <li key={`${e.at}-${e.text}`}>
            <span>{e.text}</span>
            <span className={styles.muted}>{dateTime(e.at)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
