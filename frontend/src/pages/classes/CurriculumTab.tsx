import { BookOpen, Check } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  CURRICULUM_LABEL,
  levelLabel,
  suggestCurriculum,
  useClassCurriculum,
  useProgramGroups,
  usePrograms,
  useSaveClassProgram,
  useSaveClassSubjects,
  useSaveTrackOrientation,
  type ClassCurriculum,
  type Curriculum,
  type SubjectGroup,
} from '../../api/syllabus'
import { Button, Card, SelectField } from '../../components'
import styles from './CurriculumTab.module.css'
import { ProgramFields } from './ProgramFields'

/**
 * Klassens läroplan och ämnen (idé 13, steg 1, Texas skiss "Mål från läroplanen", 2026-11-08).
 *
 * - Läroplan och program väljs när klassen skapas. Bara skoladmin ändrar dem här.
 * - Inriktningen hör till eleven. Skoladmin kopplar klassens inriktningar till Skolverkets.
 * - Läraren kryssar i de ämnen eleverna tränar under APL. Programmets och inriktningarnas ämnen
 *   är ikryssade från början.
 */
export function CurriculumTab({
  classId,
  className,
  canEdit,
  isAdmin,
}: {
  classId: string
  className: string
  canEdit: boolean
  isAdmin: boolean
}) {
  const query = useClassCurriculum(classId)
  if (query.isPending) return <p className={styles.muted}>Hämtar klassens läroplan…</p>
  if (query.isError) return <p className={styles.muted}>{query.error.message}</p>
  const saved = query.data
  return (
    <div className={styles.stack}>
      <ProgramCard classId={classId} className={className} saved={saved} isAdmin={isAdmin} />
      {saved.program_code && <TracksOrientationCard classId={classId} saved={saved} isAdmin={isAdmin} />}
      {saved.program_code &&
        (canEdit ? (
          <SubjectsForm key={saved.program_code} classId={classId} saved={saved} />
        ) : (
          <ChosenSubjects saved={saved} />
        ))}
    </div>
  )
}

function ProgramCard({
  classId,
  className,
  saved,
  isAdmin,
}: {
  classId: string
  className: string
  saved: ClassCurriculum
  isAdmin: boolean
}) {
  // Utan vald läroplan gissas den utifrån året i klassens namn.
  const [curriculum, setCurriculum] = useState<Curriculum>(saved.curriculum ?? suggestCurriculum(className))
  const [program, setProgram] = useState(saved.program_code ?? '')
  const save = useSaveClassProgram(classId)
  const changed = curriculum !== saved.curriculum || program !== (saved.program_code ?? '')
  const lostWork = saved.program_code && program !== saved.program_code && saved.subjects.length > 0

  return (
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
              {isAdmin
                ? 'Väljs när klassen skapas. Programmets ämnen hämtas från Skolverket.'
                : saved.program_code
                  ? `${CURRICULUM_LABEL[saved.curriculum!]} · ${saved.program_name}. Skoladministratören ändrar läroplan och program.`
                  : 'Skoladministratören har inte valt läroplan och program för klassen än.'}
            </p>
          </div>
        </div>
        {isAdmin && (
          <>
            <ProgramFields
              curriculum={curriculum}
              program={program}
              hint={saved.curriculum ? undefined : 'Gissat utifrån klassens namn.'}
              onChange={(c, p) => {
                setCurriculum(c)
                setProgram(p)
              }}
            />
            {lostWork && (
              <p className={styles.warning}>
                Byter du program tas klassens valda ämnen och inriktningarnas koppling bort.
              </p>
            )}
            {save.isError && <p className={styles.error}>{save.error.message}</p>}
            {changed && (
              <div>
                <Button
                  variant="primary"
                  disabled={!program || save.isPending}
                  onClick={() => save.mutate({ curriculum, program_code: program })}
                >
                  {save.isPending ? 'Sparar…' : 'Spara läroplan och program'}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </Card>
  )
}

/** Klassens inriktningar kopplade till Skolverkets. Skoladmin kopplar, läraren ser. */
function TracksOrientationCard({
  classId,
  saved,
  isAdmin,
}: {
  classId: string
  saved: ClassCurriculum
  isAdmin: boolean
}) {
  const programs = usePrograms(saved.curriculum ?? undefined)
  const save = useSaveTrackOrientation(classId)
  const orientations = programs.data?.find((p) => p.code === saved.program_code)?.orientations ?? []

  return (
    <Card>
      <section className={styles.card} aria-labelledby="orientations-title">
        <div>
          <h2 id="orientations-title" className={styles.groupTitle}>
            Inriktningar i klassen
          </h2>
          <p className={styles.muted}>
            {isAdmin
              ? 'Koppla klassens inriktningar till Skolverkets, så får läraren förslag på ämnen för dem.'
              : 'Läraren får förslag på ämnen för inriktningarna. Skoladministratören kopplar dem.'}
          </p>
        </div>
        {saved.tracks.length === 0 ? (
          <p className={styles.muted}>Klassen har inga inriktningar. De läggs till under Elever.</p>
        ) : (
          <ul className={styles.levels}>
            {saved.tracks.map((track) => (
              <li key={track.id} className={styles.trackRow}>
                <span className={styles.levelName}>{track.name}</span>
                {isAdmin ? (
                  <SelectField
                    label={`Skolverkets inriktning för ${track.name}`}
                    value={track.orientation_code ?? ''}
                    onChange={(v) => save.mutate({ trackId: track.id, code: v || null })}
                  >
                    <option value="">Ingen koppling</option>
                    {orientations.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.name}
                      </option>
                    ))}
                  </SelectField>
                ) : (
                  <span className={styles.muted}>{track.orientation_name ?? 'Inte kopplad'}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {save.isError && <p className={styles.error}>{save.error.message}</p>}
      </section>
    </Card>
  )
}

function ChosenSubjects({ saved }: { saved: ClassCurriculum }) {
  return (
    <Card>
      <section className={styles.card} aria-labelledby="subjects-title">
        <h2 id="subjects-title" className={styles.groupTitle}>
          Ämnen under APL
        </h2>
        {saved.subjects.length === 0 ? (
          <p className={styles.muted}>Klassens lärare har inte valt ämnen än.</p>
        ) : (
          <ul className={styles.plain}>
            {saved.subjects.map((s) => (
              <li key={s.level_code}>{levelLabel(s)}</li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  )
}

function SubjectsForm({ classId, saved }: { classId: string; saved: ClassCurriculum }) {
  const orientationCodes = [...new Set(saved.tracks.flatMap((t) => (t.orientation_code ? [t.orientation_code] : [])))]
  const groups = useProgramGroups(saved.program_code, orientationCodes)
  const save = useSaveClassSubjects(classId)
  // null: inget valt än, då gäller förslagen (programmets och inriktningarnas ämnen).
  const [chosen, setChosen] = useState<Set<string> | null>(
    saved.subjects.length ? new Set(saved.subjects.map((s) => s.level_code)) : null,
  )
  const [savedNow, setSavedNow] = useState(false)
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

  function toggle(code: string) {
    const next = new Set(selected)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    setChosen(next)
    setSavedNow(false)
  }

  function submit() {
    save.mutate([...selected], {
      onSuccess: (data) => {
        setChosen(new Set(data.subjects.map((s) => s.level_code)))
        setSavedNow(true)
      },
    })
  }

  return (
    <>
      <div>
        <h2 className={styles.title}>Ämnen under APL</h2>
        <p className={styles.muted}>
          Vilka ämnen tränar eleverna under APL? Programmets och inriktningarnas ämnen är ikryssade. Ta bort det som
          inte passar. Målen föreslås sedan utifrån ämnena.
        </p>
      </div>
      {groups.isPending && <p className={styles.muted}>Hämtar programmets ämnen…</p>}
      {groups.isError && <p className={styles.error}>{groups.error.message}</p>}
      {(groups.data ?? []).map((group) => (
        <GroupCard key={group.title} group={group} selected={selected} onToggle={toggle} />
      ))}
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
    </>
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
