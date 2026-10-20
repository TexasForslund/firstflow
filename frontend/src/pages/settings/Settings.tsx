import { Check } from 'lucide-react'
import { useId, useState } from 'react'

import {
  applyPreferences,
  DEFAULT_PREFERENCES,
  matchingPreset,
  PRESETS,
  useLogoutOtherDevices,
  useSavePreferences,
  type DisplayPreferences,
} from '../../auth/preferences'
import { roleLabel } from '../../auth/roles'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Button, Card, SelectField, Switch } from '../../components'
import styles from './Settings.module.css'

const TEXT_SIZES = [
  { value: 'small', label: 'Mindre' },
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Större' },
  { value: 'largest', label: 'Störst' },
] as const

/** Inställningar: hur Firstflow visas, och kontot. Namn och e-post ändras av skolans administratör. */
export function Settings() {
  const { data: user } = useCurrentUser()
  if (!user) return null
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Inställningar</h1>
        <p className={styles.subtitle}>Gäller ditt konto på alla enheter du loggar in på.</p>
      </header>
      <DisplayCard initial={user.preferences ?? DEFAULT_PREFERENCES} />
      <AccountCard
        rows={[
          ['Namn', user.name],
          ['E-post', user.email],
          ['Roll', roleLabel[user.role]],
          ...(user.school_name ? ([['Skola', user.school_name]] as [string, string][]) : []),
        ]}
      />
    </div>
  )
}

function DisplayCard({ initial }: { initial: DisplayPreferences }) {
  const [prefs, setPrefs] = useState(initial)
  const save = useSavePreferences()
  const groupId = useId()
  const preset = matchingPreset(prefs)

  // Ändringen syns direkt och sparas på kontot i bakgrunden.
  function change(patch: Partial<DisplayPreferences>) {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    applyPreferences(next)
    save.mutate(next)
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Visning</h2>
        <p className={styles.saveStatus} role="status">
          {save.isPending ? 'Sparar…' : save.isError ? `Kunde inte spara: ${save.error.message}` : save.isSuccess ? 'Sparat' : ''}
        </p>
      </div>
      <div className={styles.body}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Läge</legend>
          <div className={styles.presets}>
            {PRESETS.map((p) => {
              const selected = preset?.id === p.id
              return (
                <label key={p.id} className={`${styles.preset} ${selected ? styles.presetSelected : ''}`}>
                  <input
                    type="radio"
                    name={`${groupId}-preset`}
                    className="sr-only"
                    checked={selected}
                    onChange={() => change(p.values)}
                  />
                  <span className={`${styles.sample} ${styles[`sample-${p.id}`]}`} aria-hidden="true">
                    Aa
                  </span>
                  <span className={styles.presetText}>
                    <span className={styles.presetLabel}>
                      {p.label}
                      {selected && <Check aria-hidden="true" />}
                    </span>
                    <span className={styles.presetDescription}>{p.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
          {!preset && <p className={styles.hint}>Du har anpassat inställningarna nedan.</p>}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Anpassa</legend>
          <div className={styles.option}>
            <span className={styles.optionLabel} id={`${groupId}-size`}>
              Textstorlek
            </span>
            <div className={styles.segmented} role="radiogroup" aria-labelledby={`${groupId}-size`}>
              {TEXT_SIZES.map((size) => (
                <label key={size.value} className={prefs.text_size === size.value ? styles.segmentOn : ''}>
                  <input
                    type="radio"
                    name={`${groupId}-size`}
                    className="sr-only"
                    checked={prefs.text_size === size.value}
                    onChange={() => change({ text_size: size.value })}
                  />
                  {size.label}
                </label>
              ))}
            </div>
          </div>
          <Switch
            label="Öka kontrasten"
            description="Mörkare text och tydligare ramar"
            checked={prefs.high_contrast}
            onChange={(high_contrast) => change({ high_contrast })}
          />
          <Switch
            label="Mer luft i texten"
            description="Mer avstånd mellan rader, ord och bokstäver"
            checked={prefs.more_spacing}
            onChange={(more_spacing) => change({ more_spacing })}
          />
          <SelectField
            label="Minska rörelse"
            value={prefs.reduce_motion}
            onChange={(value) => change({ reduce_motion: value as DisplayPreferences['reduce_motion'] })}
          >
            <option value="system">Följ datorns inställning</option>
            <option value="always">Alltid, inga animationer</option>
          </SelectField>
        </fieldset>

        <section className={styles.preview} aria-label="Förhandsvisning">
          <p className={styles.previewEyebrow}>Förhandsvisning</p>
          <p className={styles.previewTitle}>Vad har du gjort i dag?</p>
          <p className={styles.previewText}>
            Beskriv arbetsuppgifterna med egna ord. Du kan ändra inställningarna när som helst.
          </p>
          <span className={styles.previewChoice}>
            <span className={styles.previewKey}>A</span> Installation
          </span>
        </section>
      </div>
    </Card>
  )
}

function AccountCard({ rows }: { rows: [string, string][] }) {
  const logout = useLogoutOtherDevices()
  const [confirming, setConfirming] = useState(false)
  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Konto</h2>
      </div>
      <dl className={styles.account}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.accountNote}>Är något fel? Kontakta skolans administratör, som ändrar kontot.</p>
      <div className={styles.devices}>
        <div>
          <p className={styles.optionLabel}>Andra enheter</p>
          <p className={styles.hint}>Logga ut överallt utom här, t.ex. om du glömt att logga ut på en skoldator.</p>
        </div>
        {confirming ? (
          <span className={styles.confirm}>
            <Button
              onClick={() => logout.mutate(undefined, { onSettled: () => setConfirming(false) })}
              disabled={logout.isPending}
            >
              Ja, logga ut
            </Button>
            <Button onClick={() => setConfirming(false)}>Avbryt</Button>
          </span>
        ) : (
          <Button onClick={() => setConfirming(true)}>Logga ut från andra enheter</Button>
        )}
      </div>
      <div aria-live="polite" className={styles.devicesResult}>
        {logout.isSuccess && (
          <p className={styles.hint}>
            {logout.data.ended === 0
              ? 'Du var inte inloggad på någon annan enhet.'
              : logout.data.ended === 1
                ? 'Du loggades ut från 1 annan enhet.'
                : `Du loggades ut från ${logout.data.ended} andra enheter.`}
          </p>
        )}
        {logout.isError && <p className={styles.error}>{logout.error.message}</p>}
      </div>
    </Card>
  )
}
