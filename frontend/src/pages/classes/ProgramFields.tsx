import { usePrograms, type Curriculum } from '../../api/syllabus'
import { SelectField } from '../../components'
import styles from './CurriculumTab.module.css'

/** Läroplan och program från Skolverket (idé 13). Används i Ny klass och på fliken Läroplan. */
export function ProgramFields({
  curriculum,
  program,
  onChange,
  hint,
}: {
  curriculum: Curriculum
  program: string
  onChange: (curriculum: Curriculum, program: string) => void
  hint?: string
}) {
  const programs = usePrograms(curriculum)
  return (
    <div className={styles.fields}>
      <div>
        <SelectField label="Läroplan" value={curriculum} onChange={(v) => onChange(v as Curriculum, '')}>
          <option value="gy25">Gy25</option>
          <option value="gy11">Gy11</option>
        </SelectField>
        <p className={styles.hint}>Gy25 om klassen började hösten 2025 eller senare.{hint && ` ${hint}`}</p>
      </div>
      <div>
        <SelectField label="Program" value={program} onChange={(v) => onChange(curriculum, v)}>
          <option value="">{programs.isPending ? 'Hämtar program…' : 'Välj program'}</option>
          {(programs.data ?? []).map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </SelectField>
        {programs.isError && <p className={styles.error}>{programs.error.message}</p>}
      </div>
    </div>
  )
}
