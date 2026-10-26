import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useAcceptInvite, useInvitePreview } from '../../api/invitations'
import { Button, Logo, TextField } from '../../components'
import styles from './Login.module.css'
import own from './AcceptInvite.module.css'

const PASSWORD_MIN = 10

/**
 * Sidan som handledaren kommer till via länken i mejlet. Hen skapar sitt konto och, om läraren
 * bjöd in, sin företagsprofil. Därefter är hen inloggad.
 */
export function AcceptInvite() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const preview = useInvitePreview(token)
  const accept = useAcceptInvite(token)

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [company, setCompany] = useState({ name: '', address: '', industry: '', description: '' })
  const [touched, setTouched] = useState(false)

  if (preview.isPending) {
    return (
      <main className={styles.page}>
        <p className={own.state}>Laddar inbjudan…</p>
      </main>
    )
  }

  if (preview.isError) {
    return (
      <main className={styles.page}>
        <div className={styles.panel}>
          <Logo height={36} />
          <div className={styles.intro}>
            <h1 className={styles.title}>Länken fungerar inte</h1>
            <p className={styles.subtitle}>
              Inbjudan finns inte, är redan använd eller har gått ut. Be den som bjöd in dig att skicka en ny.
            </p>
          </div>
          <p className={styles.note}>
            Har du redan skapat ditt konto? <Link to="/login">Logga in</Link>.
          </p>
        </div>
      </main>
    )
  }

  const invite = preview.data
  const needsCompany = invite.kind === 'supervisor'
  const passwordError =
    touched && password.length < PASSWORD_MIN
      ? `Lösenordet måste ha minst ${PASSWORD_MIN} tecken.`
      : touched && password !== repeat
        ? 'Lösenorden är inte lika.'
        : undefined

  function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (password.length < PASSWORD_MIN || password !== repeat) return
    accept.mutate(
      {
        name: name.trim(),
        password,
        company: needsCompany
          ? {
              name: company.name.trim(),
              address: company.address.trim() || null,
              industry: company.industry.trim() || null,
              description: company.description.trim() || null,
            }
          : null,
      },
      { onSuccess: () => navigate('/my-students', { replace: true }) },
    )
  }

  return (
    <main className={styles.page}>
      <div className={`${styles.panel} ${own.panel}`}>
        <Logo height={36} />
        <div className={styles.intro}>
          <h1 className={styles.title}>Välkommen till Firstflow</h1>
          <p className={styles.subtitle}>
            {invite.invited_by_name}
            {invite.workplace_name
              ? ` har bjudit in dig som handledare på ${invite.workplace_name}.`
              : ` på ${invite.school_name} har bjudit in dig att handleda elever på APL.`}{' '}
            Skapa ditt konto så kommer du igång.
          </p>
        </div>

        <form className={styles.form} onSubmit={submit} noValidate>
          {accept.isError && (
            <p className={styles.error} role="alert">
              {accept.error.message}
            </p>
          )}

          <fieldset className={own.fieldset}>
            <legend className={own.legend}>Ditt konto</legend>
            <TextField label="E-post" type="email" value={invite.email} readOnly autoComplete="username" />
            <TextField
              label="Ditt namn"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="Välj lösenord"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <TextField
              label="Upprepa lösenordet"
              type="password"
              autoComplete="new-password"
              required
              value={repeat}
              error={passwordError}
              onChange={(e) => setRepeat(e.target.value)}
            />
            <p className={own.hint}>Minst {PASSWORD_MIN} tecken. En mening fungerar bra.</p>
          </fieldset>

          {needsCompany && (
            <fieldset className={`${own.fieldset} ${own.divided}`}>
              <legend className={own.legend}>Företaget</legend>
              <p className={own.hint}>Läraren ser uppgifterna och kan sedan placera elever hos er.</p>
              <TextField
                label="Företagets namn"
                autoComplete="organization"
                required
                value={company.name}
                onChange={(e) => setCompany({ ...company, name: e.target.value })}
              />
              <TextField
                label="Adress (valfri)"
                autoComplete="street-address"
                value={company.address}
                onChange={(e) => setCompany({ ...company, address: e.target.value })}
              />
              <TextField
                label="Bransch (valfri)"
                placeholder="Till exempel el, bygg eller vård"
                value={company.industry}
                onChange={(e) => setCompany({ ...company, industry: e.target.value })}
              />
              <label className={own.textareaField}>
                <span className={own.label}>Kort om företaget (valfri)</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={company.description}
                  placeholder="Vad gör ni, och vad får eleverna jobba med?"
                  onChange={(e) => setCompany({ ...company, description: e.target.value })}
                />
              </label>
            </fieldset>
          )}

          <Button
            type="submit"
            variant="primary"
            className={styles.submit}
            disabled={accept.isPending || !name.trim() || (needsCompany && !company.name.trim())}
          >
            {accept.isPending ? 'Skapar kontot…' : 'Skapa konto'}
          </Button>
        </form>
      </div>
    </main>
  )
}
