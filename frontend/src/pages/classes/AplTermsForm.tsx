import { useState, type FormEvent } from 'react'

import { useSetAplTerms, type AplTerms } from '../../api/classes'
import { Button, Card, SelectField } from '../../components'
import { WEEKDAYS, weekdayList } from './aplTerms'
import styles from './Classes.module.css'

export function AplTermsForm({ classId, terms, canEdit }: { classId: string; terms: AplTerms; canEdit: boolean }) {
  if (!canEdit) return <AplTermsSummary terms={terms} />
  // Formuläret startar med sparade värden och behåller sedan det användaren skriver.
  return <AplTermsEditor classId={classId} terms={terms} />
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function AplTermsEditor({ classId, terms }: { classId: string; terms: AplTerms }) {
  const [days, setDays] = useState(terms.apl_days_per_week?.toString() ?? '')
  const [checkIn, setCheckIn] = useState(terms.check_in_required)
  const [weekdays, setWeekdays] = useState<number[]>(terms.report_due_weekdays ?? [])
  const [saved, setSaved] = useState(false)
  const save = useSetAplTerms(classId)

  function toggleWeekday(day: number) {
    setWeekdays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    save.mutate(
      {
        apl_days_per_week: days ? Number(days) : null,
        check_in_required: checkIn,
        report_due_weekdays: [...weekdays].sort((a, b) => a - b),
      },
      { onSuccess: () => setSaved(true) },
    )
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>APL-villkor</h2>
      </div>
      <p className={styles.cardIntro}>
        Inställningarna gäller hela klassen och styr incheckningen, närvaron och veckoredovisningarna.
      </p>
      <div className={styles.cardBody}>
        <form
          className={styles.formSingle}
          style={{ maxWidth: 'none' }}
          onSubmit={submit}
          onChange={() => setSaved(false)}
        >
          <div className={styles.formGrid}>
            <div className={styles.termField}>
              <SelectField label="APL-dagar per vecka" value={days} onChange={setDays}>
                <option value="">Inte bestämt</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'dag' : 'dagar'}
                  </option>
                ))}
              </SelectField>
              <p className={styles.hint}>
                Hur många dagar i veckan eleverna är ute på APL. Används för att räkna ut missade incheckningar
                på sidan Närvaro.
              </p>
            </div>
            <div className={styles.termField}>
              <label className={styles.check} style={{ minHeight: '3rem', marginTop: '1.75rem' }}>
                <input type="checkbox" checked={checkIn} onChange={(e) => setCheckIn(e.target.checked)} />
                Eleven checkar in varje APL-dag
              </label>
              <p className={styles.hint}>
                Eleven får en påminnelse om att checka in. Är rutan avbockad räknas dagar utan incheckning inte
                som avvikelse.
              </p>
            </div>
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Veckoredovisning ska lämnas</legend>
            <div className={styles.weekdays}>
              {WEEKDAYS.map((day, i) => (
                <label key={day} className={`${styles.weekday} ${weekdays.includes(i) ? styles.weekdayOn : ''}`}>
                  <input type="checkbox" checked={weekdays.includes(i)} onChange={() => toggleWeekday(i)} />
                  {capitalize(day)}
                </label>
              ))}
            </div>
            <p className={styles.hint}>
              {weekdays.length === 0
                ? 'Välj en eller flera dagar.'
                : `Eleverna lämnar veckoredovisning ${weekdayList(weekdays)}. De dagarna får eleven en redovisning att svara på i appen.`}
            </p>
          </fieldset>

          {save.isError && (
            <p className={styles.formError} role="alert" style={{ marginTop: 0 }}>
              {save.error.message}
            </p>
          )}
          <div className={styles.formActions} style={{ alignItems: 'center' }}>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              Spara villkor
            </Button>
            {saved && (
              <span className={styles.formSuccess} role="status" style={{ marginTop: 0 }}>
                Sparat.
              </span>
            )}
          </div>
        </form>
      </div>
    </Card>
  )
}

function AplTermsSummary({ terms }: { terms: AplTerms }) {
  const weekdays = terms.report_due_weekdays ?? []
  const rows: [string, string][] = [
    ['APL-dagar per vecka', terms.apl_days_per_week?.toString() ?? 'Inte bestämt'],
    ['Incheckning', terms.check_in_required ? 'Varje APL-dag' : 'Krävs inte'],
    ['Veckoredovisning', weekdays.length ? capitalize(weekdayList(weekdays)) : 'Inte bestämt'],
  ]
  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>APL-villkor</h2>
      </div>
      <dl className={styles.terms}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
