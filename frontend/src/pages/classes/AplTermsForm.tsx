import { useState, type FormEvent } from 'react'

import { useSetAplTerms, type AplTerms } from '../../api/classes'
import { Button, Card, SelectField, TextField } from '../../components'
import { WEEKDAYS, aplSummary, weeksBetween } from './aplTerms'
import styles from './Classes.module.css'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

export function AplTermsForm({ classId, terms, canEdit }: { classId: string; terms: AplTerms; canEdit: boolean }) {
  if (!canEdit) return <AplTermsSummary terms={terms} />
  // Formuläret startar med sparade värden och behåller sedan det användaren skriver.
  return <AplTermsEditor classId={classId} terms={terms} />
}

function AplTermsEditor({ classId, terms }: { classId: string; terms: AplTerms }) {
  const [start, setStart] = useState(terms.apl_start_date ?? '')
  const [end, setEnd] = useState(terms.apl_end_date ?? '')
  const [days, setDays] = useState(terms.apl_days_per_week?.toString() ?? '')
  const [checkIn, setCheckIn] = useState(terms.check_in_required)
  const [minPercent, setMinPercent] = useState(terms.attendance_min_percent?.toString() ?? '')
  const [weekday, setWeekday] = useState(terms.report_due_weekday?.toString() ?? '')
  const [saved, setSaved] = useState(false)
  const save = useSetAplTerms(classId)

  const draft: AplTerms = {
    apl_start_date: start || null,
    apl_end_date: end || null,
    apl_days_per_week: days ? Number(days) : null,
    check_in_required: checkIn,
    attendance_min_percent: minPercent === '' ? null : Number(minPercent),
    report_due_weekday: weekday === '' ? null : Number(weekday),
  }
  const endBeforeStart = !!start && !!end && end < start
  const summary = aplSummary(draft)
  const totalDays =
    start && end && days && !endBeforeStart ? weeksBetween(start, end) * Number(days) : null

  function submit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    save.mutate(draft, { onSuccess: () => setSaved(true) })
  }

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>APL-villkor</h2>
        {summary && <span className={styles.count}>{summary}</span>}
      </div>
      <div className={styles.cardBody}>
        <form className={styles.formSingle} style={{ maxWidth: 'none' }} onSubmit={submit} onChange={() => setSaved(false)}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>APL-period</legend>
            <div className={styles.formGrid}>
              <TextField label="Startdatum" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              <TextField
                label="Slutdatum"
                type="date"
                value={end}
                min={start || undefined}
                error={endBeforeStart ? 'Slutdatumet måste vara efter startdatumet.' : undefined}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </fieldset>

          <div className={styles.formGrid}>
            <SelectField label="APL-dagar per vecka" value={days} onChange={setDays}>
              <option value="">Inte bestämt</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'dag' : 'dagar'}
                </option>
              ))}
            </SelectField>
            <SelectField label="Veckoredovisning ska vara inlämnad" value={weekday} onChange={setWeekday}>
              <option value="">Inte bestämt</option>
              {WEEKDAYS.map((day, i) => (
                <option key={day} value={i}>
                  Senast {day}
                </option>
              ))}
            </SelectField>
          </div>

          <div className={styles.formGrid}>
            <TextField
              label="Lägsta närvaro (%)"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              placeholder="t.ex. 90"
              value={minPercent}
              onChange={(e) => setMinPercent(e.target.value)}
            />
            <label className={styles.check} style={{ alignSelf: 'end', minHeight: '3rem' }}>
              <input type="checkbox" checked={checkIn} onChange={(e) => setCheckIn(e.target.checked)} />
              Eleven checkar in varje APL-dag
            </label>
          </div>

          {totalDays !== null && (
            <p className={styles.hint}>
              {summary}, totalt cirka {totalDays} APL-dagar.
            </p>
          )}
          <p className={styles.hint}>
            Elever under närvarogränsen visas under "Behöver uppmärksamhet" på översikten. Villkoren gäller hela
            klassen och blir förval när eleverna tilldelas praktikplats.
          </p>
          {save.isError && (
            <p className={styles.formError} role="alert" style={{ marginTop: 0 }}>
              {save.error.message}
            </p>
          )}
          <div className={styles.formActions} style={{ alignItems: 'center' }}>
            <Button type="submit" variant="primary" disabled={save.isPending || endBeforeStart}>
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
  const rows: [string, string][] = [
    [
      'APL-period',
      terms.apl_start_date && terms.apl_end_date
        ? `${formatDate(terms.apl_start_date)} – ${formatDate(terms.apl_end_date)}`
        : 'Inte bestämt',
    ],
    ['APL-dagar per vecka', terms.apl_days_per_week?.toString() ?? 'Inte bestämt'],
    ['Incheckning', terms.check_in_required ? 'Varje APL-dag' : 'Krävs inte'],
    ['Lägsta närvaro', terms.attendance_min_percent !== null && terms.attendance_min_percent !== undefined ? `${terms.attendance_min_percent} %` : 'Inte bestämt'],
    [
      'Veckoredovisning',
      terms.report_due_weekday !== null && terms.report_due_weekday !== undefined
        ? `Senast ${WEEKDAYS[terms.report_due_weekday]}`
        : 'Inte bestämt',
    ],
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
