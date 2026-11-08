import { BookOpen, Check } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  CURRICULUM_LABEL,
  levelLabel,
  useClassCurriculum,
  useProgramGroups,
  usePrograms,
  useSaveClassCurriculum,
  type ClassCurriculum,
  type Curriculum,
  type SubjectGroup,
} from '../../api/syllabus'
import { Button, Card, SelectField } from '../../components'
import styles from './CurriculumTab.module.css'

/**
 * Klassens läroplan och ämnen (idé 13, steg 1, Texas skiss "Mål från läroplanen", 2026-11-08).
 * Läraren väljer läroplan, program och inriktning. Firstflow hämtar programmets ämnen från
 * Skolverket och kryssar i det alla på programmet läser och inriktningens ämnen. Läraren tar
 * bort det eleverna inte tränar under APL och kan lägga till fler.
 */
export function CurriculumTab({ classId, canEdit }: { classId: string; canEdit: boolean }) {
  const query = useClassCurriculum(classId)
  if (query.isPending) return <p className={styles.muted}>Hämtar klassens läroplan…</p>
  if (query.isError) return <p className={styles.muted}>{query.error.message}</p>
  if (!canEdit) return <ChosenSubjects saved={query.data} />
  return <CurriculumForm classId={classId} saved={query.data} />
}

function ChosenSubjects({ saved }: { saved: ClassCurriculum }) {
  return (
    <Card>
      <section className={styles.card} aria-labelledby="curriculum-title">
        <h2 id="curriculum-title" className={styles.title}>
          Läroplan
        </h2>
        {saved.subjects.length === 0 ? (
          <p className={styles.muted}>Klassens lärare har inte valt läroplan och ämnen än.</p>
        ) : (
          <>
            <p className={styles.muted}>
              {saved.curriculum && CURRICULUM_LABEL[saved.curriculum]} · {saved.program_name}
            </p>
            <ul className={styles.plain}>
              {saved.subjects.map((s) => (
                <li key={s.level_code}>{levelLabel(s)}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </Card>
  )
}

function CurriculumForm({ classId, saved }: { classId: string; saved: ClassCurriculum }) {
  const [curriculum, setCurriculum] = useState<Curriculum>(saved.curriculum ?? saved.suggested_curriculum)
  const [program, setProgram] = useState(saved.program_code ?? '')
  const [orientation, setOrientation] = useState(saved.orientation_code ?? '')
  // null: inget valt än, då gäller förslagen (programmets och inriktningens ämnen).
  const [chosen, setChosen] = useState<Set<string> | null>(
    saved.subjects.length ? new Set(saved.subjects.map((s) => s.level_code)) : null,
  )
  const [savedNow, setSavedNow] = useState(false)
  const programs = usePrograms(curriculum)
  const groups = useProgramGroups(program || undefined, orientation || undefined)
  const save = useSaveClassCurriculum(classId)

  const orientations = programs.data?.find((p) => p.code === program)?.orientations ?? []
  const suggested = useMemo(
    () =>
      new Set(
        (groups.data ?? [])
          .filter((g) => g.kind === 'program' || g.kind === 'orientation')
          .flatMap((g) => g.levels.map((l) => l.level_code)),
      ),
    [groups.data],
  )
  const selected = chosen ?? suggested

  function change(next: () => void) {
    next()
    setSavedNow(false)
  }

  function toggle(code: string) {
    change(() => {
      const next = new Set(selected)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      setChosen(next)
    })
  }

  function submit() {
    save.mutate(
      {
        curriculum,
        program_code: program,
        orientation_code: orientation || null,
        level_codes: [...selected],
      },
      {
        onSuccess: (data) => {
          setChosen(new Set(data.subjects.map((s) => s.level_code)))
          setSavedNow(true)
        },
      },
    )
  }

  return (
    <div className={styles.stack}>
      <Card>
        <section className={styles.card} aria-labelledby="curriculum-title">
          <div className={styles.head}>
            <span className={styles.icon}>
              <BookOpen aria-hidden="true" />
            </span>
            <div>
              <h2 id="curriculum-title" className={styles.title}>
                Läroplan och program
              </h2>
              <p className={styles.muted}>
                Vilka ämnen tränar eleverna under APL? Firstflow hämtar programmets ämnen från Skolverket. Målen
                föreslås sedan utifrån ämnena.
              </p>
            </div>
          </div>
          <div className={styles.fields}>
            <div>
              <SelectField
                label="Läroplan"
                value={curriculum}
                onChange={(v) =>
                  change(() => {
                    setCurriculum(v as Curriculum)
                    setProgram('')
                    setOrientation('')
                    setChosen(null)
                  })
                }
              >
                <option value="gy25">Gy25</option>
                <option value="gy11">Gy11</option>
              </SelectField>
              <p className={styles.hint}>
                Gy25 om klassen började hösten 2025 eller senare.
                {!saved.curriculum && ' Gissat utifrån klassens namn.'}
              </p>
            </div>
            <SelectField
              label="Program"
              value={program}
              onChange={(v) =>
                change(() => {
                  setProgram(v)
                  setOrientation('')
                  setChosen(null)
                })
              }
            >
              <option value="">{programs.isPending ? 'Hämtar program…' : 'Välj program'}</option>
              {(programs.data ?? []).map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Inriktning"
              value={orientation}
              onChange={(v) =>
                change(() => {
                  setOrientation(v)
                  if (!saved.subjects.length) setChosen(null)
                })
              }
            >
              <option value="">{orientations.length ? 'Ingen inriktning' : 'Programmet har inga inriktningar'}</option>
              {orientations.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
            </SelectField>
          </div>
          {programs.isError && <p className={styles.error}>{programs.error.message}</p>}
        </section>
      </Card>

      {program && groups.isPending && <p className={styles.muted}>Hämtar programmets ämnen…</p>}
      {groups.isError && <p className={styles.error}>{groups.error.message}</p>}
      {(groups.data ?? []).map((group) => (
        <GroupCard key={group.title} group={group} selected={selected} onToggle={toggle} />
      ))}

      {program && (
        <div className={styles.footer}>
          <span className={styles.muted}>
            {selected.size} {selected.size === 1 ? 'ämne valt' : 'ämnen valda'}
          </span>
          {savedNow && (
            <span className={styles.saved}>
              <Check aria-hidden="true" /> Sparat
            </span>
          )}
          {save.isError && <span className={styles.error}>{save.error.message}</span>}
          <Button variant="primary" onClick={submit} disabled={save.isPending || !groups.data}>
            {save.isPending ? 'Sparar…' : 'Spara ämnen'}
          </Button>
        </div>
      )}
    </div>
  )
}

const OPEN: SubjectGroup['kind'][] = ['program', 'orientation']

/** En grupp ämnen med kryssrutor. Yrkesutgångar och programfördjupning är hopfällda. */
function GroupCard({
  group,
  selected,
  onToggle,
}: {
  group: SubjectGroup
  selected: Set<string>
  onToggle: (code: string) => void
}) {
  const count = group.levels.filter((l) => selected.has(l.level_code)).length
  const list = (
    <ul className={styles.levels}>
      {group.levels.map((level) => (
        <li key={level.level_code}>
          <label className={styles.level}>
            <input
              type="checkbox"
              checked={selected.has(level.level_code)}
              onChange={() => onToggle(level.level_code)}
            />
            <span className={styles.levelText}>
              <span className={styles.levelName}>{levelLabel(level)}</span>
              {level.points && <span className={styles.muted}>{level.points} poäng</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
  return (
    <Card>
      {OPEN.includes(group.kind) ? (
        <section className={styles.card} aria-label={group.title}>
          <div className={styles.groupHead}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <span className={styles.source}>Från Skolverket</span>
          </div>
          {list}
        </section>
      ) : (
        <details className={styles.card}>
          <summary className={styles.summary}>
            <span className={`${styles.groupTitle} ${styles.grow}`}>{group.title}</span>
            <span className={styles.muted}>
              {count > 0 ? `${count} valda` : `${group.levels.length} att välja bland`}
            </span>
          </summary>
          {list}
        </details>
      )}
    </Card>
  )
}
