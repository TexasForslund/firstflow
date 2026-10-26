import { Building2, MapPin, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import {
  useInvitations,
  useInviteSupervisor,
  useResendInvitation,
  useRevokeInvitation,
  type Invitation,
  type InvitationStatus,
} from '../../api/invitations'
import { useWorkplaces, type Workplace } from '../../api/placements'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, Card, TextField } from '../../components'
import styles from '../classes/Classes.module.css'
import own from './Placements.module.css'

/**
 * Praktikplatser. Läraren bjuder in handledare, som själva skapar konto och företagsprofil.
 * Företagen syns bara för läraren som bjöd in, och för skolans ledning (Texas, 2026-10-26).
 */
export function Placements() {
  const { data: user } = useCurrentUser()
  const query = useWorkplaces()
  const canInvite = user?.role === 'teacher' || user?.role === 'school_admin'
  const workplaces = query.data ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Praktikplatser</h1>
        <p className={styles.subtitle}>
          {canInvite
            ? 'Bjud in handledare. De skapar själva sitt konto och sin företagsprofil, sedan kan du placera elever där från klassvyn.'
            : 'Skolans företag och handledare.'}
        </p>
      </header>

      {canInvite && <InviteCard />}
      {canInvite && <InvitationList />}

      <section className={own.section} aria-labelledby="companies-title">
        <h2 id="companies-title" className={own.sectionTitle}>
          {user?.role === 'teacher' ? 'Dina företag' : 'Skolans företag'}
        </h2>
        {query.isPending && <p className={styles.state}>Laddar företag…</p>}
        {query.isError && <p className={styles.state}>Företagen gick inte att hämta. Ladda om sidan.</p>}
        {query.isSuccess && workplaces.length === 0 && (
          <Card>
            <p className={styles.empty}>
              Inga företag än. När en handledare har tackat ja till din inbjudan visas företaget här.
            </p>
          </Card>
        )}
        {workplaces.map((workplace) => (
          <WorkplaceCard key={workplace.id} workplace={workplace} />
        ))}
      </section>
    </div>
  )
}

function InviteCard() {
  const invite = useInviteSupervisor()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    setSent(null)
    invite.mutate(email.trim(), {
      onSuccess: (invitation) => {
        setSent(invitation.email)
        setEmail('')
      },
    })
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Bjud in handledare</h2>
      </div>
      <div className={styles.cardBody}>
        <form className={own.inviteForm} onSubmit={submit}>
          <TextField
            label="Handledarens e-post"
            type="email"
            autoComplete="off"
            placeholder="namn@foretag.se"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" variant="primary" icon={<Send aria-hidden="true" />} disabled={invite.isPending}>
            {invite.isPending ? 'Skickar…' : 'Skicka inbjudan'}
          </Button>
        </form>
        {invite.isError && (
          <p className={styles.formError} role="alert">
            {invite.error.message}
          </p>
        )}
        {sent && (
          <p className={styles.formSuccess} role="status">
            Inbjudan är skickad till {sent}. Du får en notis när handledaren har skapat sin företagsprofil.
          </p>
        )}
        <p className={`${styles.hint} ${own.hintSpaced}`}>
          Handledaren får ett mejl med en personlig länk som gäller i 14 dagar.
        </p>
      </div>
    </Card>
  )
}

const statusText: Record<InvitationStatus, string> = {
  pending: 'Väntar på svar',
  accepted: 'Konto skapat',
  expired: 'Länken har gått ut',
  revoked: 'Återkallad',
}

function InvitationList() {
  const invitations = useInvitations()
  const items = invitations.data ?? []
  if (items.length === 0) return null

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Skickade inbjudningar</h2>
        <span className={styles.count}>{items.length}</span>
      </div>
      <ul className={styles.list}>
        {items.map((invitation) => (
          <InvitationRow key={invitation.id} invitation={invitation} />
        ))}
      </ul>
    </Card>
  )
}

function InvitationRow({ invitation }: { invitation: Invitation }) {
  const resend = useResendInvitation()
  const revoke = useRevokeInvitation()
  const [confirming, setConfirming] = useState(false)
  const sentAt = new Date(invitation.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
  const open = invitation.status !== 'accepted'

  return (
    <li className={`${styles.row} ${own.invitationRow}`}>
      <span className={styles.rowText} style={{ flex: 1 }}>
        <span className={styles.name}>{invitation.email}</span>
        <span className={styles.meta}>
          {invitation.workplace_name ? `${invitation.workplace_name} · ` : ''}Skickad {sentAt}
        </span>
      </span>
      <span className={`${own.status} ${own[invitation.status]}`}>{statusText[invitation.status]}</span>
      {open && (
        <span className={styles.rowActions}>
          {confirming ? (
            <>
              <span className={styles.confirmText}>Återkalla?</span>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(invitation.id, { onSuccess: () => setConfirming(false) })}
              >
                Återkalla
              </button>
              <button type="button" className={styles.textButton} onClick={() => setConfirming(false)}>
                Avbryt
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.textButton}
                disabled={resend.isPending}
                onClick={() => resend.mutate(invitation.id)}
              >
                {resend.isSuccess ? 'Skickad!' : 'Skicka igen'}
              </button>
              {invitation.status === 'pending' && (
                <button type="button" className={styles.textButton} onClick={() => setConfirming(true)}>
                  Återkalla
                </button>
              )}
            </>
          )}
        </span>
      )}
    </li>
  )
}

function WorkplaceCard({ workplace }: { workplace: Workplace }) {
  return (
    <Card>
      <div className={styles.cardHeader}>
        <div className={own.heading}>
          <h3 className={styles.cardTitle}>
            <Building2 aria-hidden="true" className={own.companyIcon} />
            {workplace.name}
          </h3>
          <span className={own.address}>
            {workplace.industry && <span>{workplace.industry}</span>}
            {workplace.address && (
              <>
                <MapPin aria-hidden="true" />
                {workplace.address}
              </>
            )}
          </span>
        </div>
        <span className={styles.count}>{workplace.supervisors.length} handledare</span>
      </div>
      {workplace.description && <p className={own.description}>{workplace.description}</p>}
      <ul className={styles.list}>
        {workplace.supervisors.map((s) => (
          <li key={s.id} className={styles.row}>
            <span className={styles.rowLink}>
              <Avatar name={s.name} />
              <span className={styles.rowText}>
                <span className={styles.name}>{s.name}</span>
                <span className={styles.meta}>{s.email}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
