import { useState, type FormEvent } from 'react'

import { useSetAplTerms, type AplTerms } from '../../api/classes'
import { Button, Card, HelpPopover } from '../../components'
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
  const [aplDays, setAplDays] = useState<number[]>(terms.apl_weekdays ?? [])
  const [checkIn, setCheckIn] = useState(terms.check_in_required)
  const [reportDays, setReportDays] = useState<number[]>(terms.report_due_weekdays ?? [])
  const [saved, setSaved] = useState(false)
  const save = useSetAplTerms(classId)

  function toggleAplDay(day: number) {
    if (aplDays.includes(day)) {
      // En redovisningsdag måste vara en APL-dag, så den försvinner också.
      setAplDays(aplDays.filter((d) => d !== day))
      setReportDays(reportDays.filter((d) => d !== day))
    } else {
      setAplDays([...aplDays, day])
    }
  }

  function toggleReportDay(day: number) {
    setReportDays(reportDays.includes(day) ? reportDays.filter((d) => d !== day) : [...reportDays, day])
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    save.mutate(
      {
        apl_weekdays: [...aplDays].sort((a, b) => a - b),
        check_in_required: checkIn,
        report_due_weekdays: [...reportDays].sort((a, b) => a - b),
      },
      { onSuccess: () => setSaved(true) },
    )
  }

  const offDays = WEEKDAYS.map((_, i) => i).filter((i) => !aplDays.includes(i))

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>APL-villkor</h2>
      </div>
      <p className={styles.cardIntro}>Gäller hela klassen och styr incheckningen, närvaron och redovisningarna.</p>
      <div className={styles.cardBody}>
        <form
          className={styles.formSingle}
          style={{ maxWidth: 'none' }}
          onSubmit={submit}
          onChange={() => setSaved(false)}
        >
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>
              APL-dagar <span className={styles.legendHint}>dagarna eleverna är på APL och checkar in</span>{' '}
              <HelpPopover topic="aplDays" />
            </legend>
            <div className={styles.weekdays}>
              {WEEKDAYS.map((day, i) => (
                <label key={day} className={`${styles.weekday} ${aplDays.includes(i) ? styles.weekdayOn : ''}`}>
                  <input type="checkbox" checked={aplDays.includes(i)} onChange={() => toggleAplDay(i)} />
                  {capitalize(day)}
                </label>
              ))}
            </div>
            <p className={styles.hint}>
              {aplDays.length === 0
                ? 'Välj de dagar eleverna är på APL.'
                : `${aplDays.length} ${aplDays.length === 1 ? 'dag' : 'dagar'} i veckan: ${weekdayList(aplDays)}.${
                    offDays.length > 0 ? ` ${capitalize(weekdayList(offDays))} räknas inte som frånvaro.` : ''
                  }`}
            </p>
            <label className={styles.check}>
              <input type="checkbox" checked={checkIn} onChange={(e) => setCheckIn(e.target.checked)} />
              Eleven checkar in varje APL-dag
            </label>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>
              Redovisningsdagar <span className={styles.legendHint}>väljs bland APL-dagarna</span>
            </legend>
            <div className={styles.weekdays}>
              {WEEKDAYS.map((day, i) => {
                const disabled = !aplDays.includes(i)
                return (
                  <label
                    key={day}
                    className={`${styles.weekday} ${reportDays.includes(i) ? styles.weekdayOn : ''} ${
                      disabled ? styles.weekdayOff : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={reportDays.includes(i)}
                      disabled={disabled}
                      onChange={() => toggleReportDay(i)}
                    />
                    {capitalize(day)}
                  </label>
                )
              })}
            </div>
            <p className={styles.hint}>
              {reportDays.length === 0
                ? 'Välj en eller flera dagar. Dagar utan APL går inte att välja.'
                : `Eleverna redovisar ${weekdayList(reportDays)}. De dagarna får eleven en redovisning att svara på i appen.`}
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
  const aplDays = terms.apl_weekdays ?? []
  const reportDays = terms.report_due_weekdays ?? []
  const rows: [string, string][] = [
    ['APL-dagar', aplDays.length ? capitalize(weekdayList(aplDays)) : 'Inte bestämt'],
    ['Incheckning', terms.check_in_required ? 'Varje APL-dag' : 'Krävs inte'],
    ['Redovisningsdagar', reportDays.length ? capitalize(weekdayList(reportDays)) : 'Inte bestämt'],
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
