import { GraduationCap, MapPin, Send, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'

import {
  useCompanyLogo,
  useInviteColleague,
  useSupervisorWorkplaces,
  useUpdateCompany,
  type SupervisorWorkplace,
} from '../../api/invitations'
import { Avatar, Button, Card, CompanyLogo, HelpPopover, TextField } from '../../components'
import styles from '../classes/Classes.module.css'
import own from '../placements/Placements.module.css'
import page from './Company.module.css'

/**
 * Handledarens företagsprofil och kollegor. Handledaren kan bjuda in upp till tre kollegor.
 * En handledare har ett företag, som kan ta emot elever från flera skolor (Texas, 2026-11-02).
 */
export function Company() {
  const query = useSupervisorWorkplaces()
  const workplaces = query.data ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{workplaces.length > 1 ? 'Företag' : 'Företaget'}</h1>
        <p className={styles.subtitle}>Er företagsprofil och handledarna som tar emot elever.</p>
      </header>
      {query.isPending && <p className={styles.state}>Laddar…</p>}
      {query.isError && <p className={styles.state}>Företaget gick inte att hämta. Ladda om sidan.</p>}
      {query.isSuccess && workplaces.length === 0 && (
        <Card>
          <p className={styles.empty}>Du är inte kopplad till något företag än.</p>
        </Card>
      )}
      {workplaces.map((w) => (
        <div key={w.id} className={page.company}>
          <ProfileCard workplace={w} />
          <ColleaguesCard workplace={w} />
        </div>
      ))}
    </div>
  )
}

/** Ladda upp eller ta bort loggan. Sparas direkt, oberoende av Spara för resten av profilen. */
function LogoField({ workplace }: { workplace: SupervisorWorkplace }) {
  const { upload, remove } = useCompanyLogo(workplace.id)
  const input = useRef<HTMLInputElement>(null)
  const [tooBig, setTooBig] = useState(false)
  const busy = upload.isPending || remove.isPending
  const error = tooBig ? 'Loggan får vara högst 1 MB.' : (upload.error ?? remove.error)?.message

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setTooBig(file.size > 1024 * 1024)
    if (file.size <= 1024 * 1024) upload.mutate(file)
  }

  return (
    <div className={page.logoField}>
      <span className={page.label}>Logga</span>
      <div className={page.logoRow}>
        <CompanyLogo name={workplace.name} logoUrl={workplace.logo_url} size="lg" />
        <div className={page.logoActions}>
          <div className={page.logoButtons}>
            <Button icon={<Upload aria-hidden="true" />} disabled={busy} onClick={() => input.current?.click()}>
              {workplace.logo_url ? 'Byt logga' : 'Ladda upp logga'}
            </Button>
            {workplace.logo_url && (
              <Button icon={<Trash2 aria-hidden="true" />} disabled={busy} onClick={() => remove.mutate()}>
                Ta bort
              </Button>
            )}
          </div>
          <span className={page.hint}>PNG, JPG eller WebP, högst 1 MB. En kvadratisk bild blir finast.</span>
          {error && (
            <span className={styles.formError} role="alert">
              {error}
            </span>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={choose}
      />
    </div>
  )
}

function ProfileCard({ workplace }: { workplace: SupervisorWorkplace }) {
  const [editing, setEditing] = useState(false)
  const update = useUpdateCompany(workplace.id)
  const [form, setForm] = useState({
    name: workplace.name,
    address: workplace.address ?? '',
    industry: workplace.industry ?? '',
    description: workplace.description ?? '',
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    update.mutate(
      {
        name: form.name.trim(),
        address: form.address.trim() || null,
        industry: form.industry.trim() || null,
        description: form.description.trim() || null,
      },
      { onSuccess: () => setEditing(false) },
    )
  }

  return (
    <Card>
      <div className={`${styles.cardHeader} ${page.logoHeader}`}>
        <CompanyLogo name={workplace.name} logoUrl={workplace.logo_url} size="lg" />
        <div className={`${own.heading} ${page.headingGrow}`}>
          <h2 className={styles.cardTitle}>{workplace.name}</h2>
          <span className={own.address}>
            {workplace.school_names.length === 1
              ? `Elever från ${workplace.school_names[0]}`
              : 'Elever från flera skolor'}
          </span>
        </div>
        {!editing && <Button onClick={() => setEditing(true)}>Redigera</Button>}
      </div>
      {editing ? (
        <form className={`${styles.cardBody} ${page.form}`} onSubmit={submit}>
          <LogoField workplace={workplace} />
          <TextField
            label="Företagets namn"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            label="Adress"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <TextField
            label="Bransch"
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
          />
          <label className={page.textareaField}>
            <span className={page.label}>Kort om företaget</span>
            <textarea
              rows={4}
              maxLength={1000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          {workplace.school_names.length > 1 && (
            <p className={page.hint}>Ändringarna syns för alla skolor ni tar emot elever från.</p>
          )}
          {update.isError && (
            <p className={styles.formError} role="alert">
              {update.error.message}
            </p>
          )}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" disabled={update.isPending || !form.name.trim()}>
              Spara
            </Button>
            <Button onClick={() => setEditing(false)}>Avbryt</Button>
          </div>
        </form>
      ) : (
        <dl className={page.details}>
          <div>
            <dt>Adress</dt>
            <dd>
              {workplace.address ? (
                <>
                  <MapPin aria-hidden="true" className={page.inlineIcon} />
                  {workplace.address}
                </>
              ) : (
                'Inte ifyllt'
              )}
            </dd>
          </div>
          <div>
            <dt>Bransch</dt>
            <dd>{workplace.industry ?? 'Inte ifyllt'}</dd>
          </div>
          <div className={page.wide}>
            <dt>Om företaget</dt>
            <dd>{workplace.description ?? 'Inte ifyllt'}</dd>
          </div>
          <div className={page.wide}>
            <dt>
              Skolor ni tar emot elever från <HelpPopover topic="sharedCompany" />
            </dt>
            <dd className={page.schools}>
              {workplace.school_names.map((school) => (
                <span key={school} className={page.school}>
                  <GraduationCap aria-hidden="true" />
                  {school}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      )}
    </Card>
  )
}

function ColleaguesCard({ workplace }: { workplace: SupervisorWorkplace }) {
  const invite = useInviteColleague(workplace.id)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    setSent(null)
    const address = email.trim()
    invite.mutate(address, {
      onSuccess: () => {
        setSent(address)
        setEmail('')
      },
    })
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Handledare</h2>
        <span className={styles.count}>{workplace.supervisors.length}</span>
      </div>
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
        {workplace.pending_invitations.map((i) => (
          <li key={i.id} className={styles.row}>
            <span className={styles.rowLink}>
              <Avatar name={i.email} />
              <span className={styles.rowText}>
                <span className={styles.name}>{i.email}</span>
                <span className={styles.meta}>Inbjuden, väntar på svar</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.cardBody}>
        {workplace.can_invite ? (
          <form className={own.inviteForm} onSubmit={submit}>
            <TextField
              label="Bjud in en kollega"
              type="email"
              placeholder="kollega@foretag.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" variant="primary" icon={<Send aria-hidden="true" />} disabled={invite.isPending}>
              Skicka inbjudan
            </Button>
          </form>
        ) : (
          <p className={styles.hint}>Ni kan vara upp till fyra handledare: du och tre kollegor.</p>
        )}
        {invite.isError && (
          <p className={styles.formError} role="alert">
            {invite.error.message}
          </p>
        )}
        {sent && (
          <p className={styles.formSuccess} role="status">
            Inbjudan är skickad till {sent}.
          </p>
        )}
        {workplace.can_invite && (
          <p className={`${styles.hint} ${own.hintSpaced}`}>Du kan bjuda in upp till tre kollegor.</p>
        )}
      </div>
    </Card>
  )
}
