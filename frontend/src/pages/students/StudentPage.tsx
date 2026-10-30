import {
  BriefcaseBusiness,
  CalendarCheck,
  Download,
  FileSignature,
  FileText,
  Folder,
  Lock,
  MapPin,
  MapPinCheck,
  NotebookPen,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { waitingText, type AttentionItem } from '../../api/overview'
import { useStudentProjects } from '../../api/projects'
import { useSchoolTeachers } from '../../api/classes'
import {
  useSetTeachers,
  useStudent,
  useStudentAttendance,
  useStudentAttention,
  useStudentPlacements,
  useStudentReports,
  type Student,
  type StudentReportSummary,
} from '../../api/students'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, Card, matches, SearchInput, SegmentedBar, SelectField, Tag } from '../../components'
import styles from '../classes/Classes.module.css'
import { NotFound } from '../NotFound'
import {
  currentPlacement,
  periodCountdown,
  periodProgress,
  periodStatus,
  periodText,
  periodWeek,
  todayIso,
} from '../placements/period'
import { CheckList } from './CheckList'
import { noteTagLabel, useStudentNotes, type NoteTag } from '../../api/notes'
import { NoteItem } from '../notes/StudentNotes'
import { StudentGoalsCard } from '../goals/GoalViews'
import own from './StudentPage.module.css'

const REPORTS_PER_PAGE = 10

function parseDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`)
}

function longDate(iso: string) {
  const text = parseDay(iso).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function shortDate(iso: string) {
  return parseDay(iso).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function dateTime(iso: string) {
  const at = new Date(iso)
  return `${at.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })} ${at.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Elevsidan: allt om en elev på ett ställe, dit alla klick på en elev leder.
 * Redovisningarna har mest plats till vänster. Till höger uppmärksamhet, närvaro och
 * praktikplats (Texas, 2026-10-26).
 */
export function StudentPage() {
  const { studentId = '' } = useParams()
  const { data: user } = useCurrentUser()
  const query = useStudent(studentId)
  const [editTeachers, setEditTeachers] = useState(false)

  if (query.isPending) return <p className={styles.state}>Laddar eleven…</p>
  if (query.isError) return <NotFound what="Eleven" />

  const student = query.data
  const isAdmin = user?.role === 'school_admin'
  const isTeacher = user?.role === 'teacher'
  const schoolClass = student.classes[0]

  return (
    <div className={own.page}>
      <p className={own.breadcrumb}>
        <Link to={isTeacher ? '/student-history' : '/students'}>{isTeacher ? 'Elevhistorik' : 'Elever'}</Link> /{' '}
        {student.name}
      </p>

      <header className={own.header}>
        <Avatar name={student.name} size="md" />
        <div className={own.heading}>
          <h1 className={own.title}>{student.name}</h1>
          <p className={own.subtitle}>
            {student.email}
            {student.school_name ? ` · ${student.school_name}` : ''}
          </p>
        </div>
        <div className={own.headerActions}>
          {schoolClass && (
            <Link to={`/classes/${schoolClass.id}`} className={styles.tagLink}>
              <Tag icon={<Users aria-hidden="true" />}>{schoolClass.name}</Tag>
            </Link>
          )}
          <Button icon={<Download aria-hidden="true" />} disabled title="Kommer snart">
            Exportera
          </Button>
        </div>
      </header>

      <div className={own.columns}>
        <div className={own.main}>
          {isTeacher ? (
            <ReportsSection studentId={student.id} />
          ) : (
            <Card>
              <p className={styles.empty}>Redovisningarna syns för elevens lärare.</p>
            </Card>
          )}
        </div>
        <div className={own.side}>
          <AttentionBox studentId={student.id} />
          <AttendanceCard studentId={student.id} />
          <PlacementCard studentId={student.id} />
          {isTeacher && <StudentGoalsCard studentId={student.id} />}
          {isTeacher && <NotesCard studentId={student.id} />}
          <ProjectsCard studentId={student.id} />
          {isAdmin &&
            (editTeachers ? (
              <TeachersEditor student={student} schoolId={user?.school_id} />
            ) : (
              <button type="button" className={own.textLink} onClick={() => setEditTeachers(true)}>
                Ändra lärare ({student.teachers.length})
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

// --- Redovisningar --------------------------------------------------------------------------

type Show = 'all' | 'unread' | 'comments' | 'missing'
type Period = 'all' | 'week' | 'month'

type Entry = { kind: 'report'; date: string; report: StudentReportSummary } | { kind: 'missing'; date: string }

function weekStart(today: string) {
  const d = parseDay(today)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function daysBefore(today: string, days: number) {
  const d = parseDay(today)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function ReportsSection({ studentId }: { studentId: string }) {
  const reports = useStudentReports(studentId, true)
  const attention = useStudentAttention(studentId)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [questionId, setQuestionId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [shown, setShown] = useState(REPORTS_PER_PAGE)

  const list = reports.data ?? []
  const missingDays = attention.data?.missing_report_days ?? []
  const today = todayIso()
  const from = period === 'week' ? weekStart(today) : period === 'month' ? daysBefore(today, 27) : ''

  // Frågorna som finns i elevens svar, för filtret Fråga.
  const questions = new Map<string, string>()
  for (const r of list)
    for (const a of r.answers) if (!questions.has(a.question_id)) questions.set(a.question_id, a.question)

  const entries: Entry[] = [
    ...list.map((report) => ({ kind: 'report' as const, date: report.due_date, report })),
    ...missingDays.map((date) => ({ kind: 'missing' as const, date })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const inPeriod = entries.filter((e) => !from || e.date >= from)
  const counts: Record<Show, number> = {
    all: inPeriod.filter((e) => e.kind === 'report').length,
    unread: inPeriod.filter((e) => e.kind === 'report' && !e.report.is_read).length,
    comments: inPeriod.filter((e) => e.kind === 'report' && e.report.comment_count > 0).length,
    missing: inPeriod.filter((e) => e.kind === 'missing').length,
  }
  const filtering = search.trim() !== '' || questionId !== '' || projectId !== ''
  // Projekten som elevens redovisningar hör till, för filtret Projekt.
  const projects = new Map<string, string>()
  for (const r of list) if (r.project) projects.set(r.project.id, r.project.name)
  const visible = inPeriod.filter((e) => {
    if (e.kind === 'missing') return (show === 'all' || show === 'missing') && !filtering
    const r = e.report
    if (show === 'missing') return false
    if (show === 'unread' && r.is_read) return false
    if (show === 'comments' && r.comment_count === 0) return false
    if (projectId && r.project?.id !== projectId) return false
    const answers = questionId ? r.answers.filter((a) => a.question_id === questionId) : r.answers
    if (questionId && answers.length === 0) return false
    if (search.trim() && !answers.some((a) => matches(a.text, search))) return false
    return true
  })

  const chips: { id: Show; label: string }[] = [
    { id: 'all', label: 'Alla' },
    { id: 'unread', label: 'Olästa' },
    { id: 'comments', label: 'Med kommentarer' },
    { id: 'missing', label: 'Saknas' },
  ]

  return (
    <section className={own.reports} aria-labelledby="reports-title">
      <div className={own.reportsHeading}>
        <h2 id="reports-title" className={own.reportsTitle}>
          Redovisningar
        </h2>
        {reports.isSuccess && (
          <span className={own.muted}>
            {plural(list.length, 'inlämnad', 'inlämnade')}
            {counts.unread > 0 ? ` · ${counts.unread} oläst${counts.unread === 1 ? '' : 'a'}` : ''}
            {missingDays.length > 0 ? ` · ${missingDays.length} saknas` : ''}
          </span>
        )}
      </div>

      <div className={own.filters}>
        <div className={own.filterRow}>
          <div className={own.search}>
            <SearchInput label="Sök i svaren" placeholder="Sök i svaren" value={search} onChange={setSearch} />
          </div>
          <SelectField label="Period" value={period} onChange={(v) => setPeriod(v as Period)}>
            <option value="all">Hela tiden</option>
            <option value="week">Den här veckan</option>
            <option value="month">Senaste fyra veckorna</option>
          </SelectField>
          {projects.size > 0 && (
            <SelectField label="Projekt" value={projectId} onChange={setProjectId}>
              <option value="">Alla projekt</option>
              {[...projects].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField label="Fråga" value={questionId} onChange={setQuestionId}>
            <option value="">Alla frågor</option>
            {[...questions].map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </SelectField>
        </div>
        <div className={own.chips} role="group" aria-label="Visa">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={show === chip.id}
              className={`${own.chip} ${show === chip.id ? own.chipOn : ''}`}
              onClick={() => {
                setShow(chip.id)
                setShown(REPORTS_PER_PAGE)
              }}
            >
              {chip.label} <span className={own.chipCount}>{counts[chip.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {reports.isPending && <p className={own.muted}>Laddar redovisningar…</p>}
      {reports.isError && <p className={own.muted}>Redovisningarna gick inte att hämta.</p>}
      {reports.isSuccess && visible.length === 0 && (
        <Card>
          <p className={styles.empty}>
            {entries.length === 0
              ? 'Eleven har inte lämnat någon redovisning än.'
              : 'Inga redovisningar matchar filtret.'}
          </p>
        </Card>
      )}

      {visible.slice(0, shown).map((entry) =>
        entry.kind === 'missing' ? (
          <article key={`missing-${entry.date}`} className={own.missing}>
            <span className={own.reportDate}>{longDate(entry.date)}</span>
            <span className={`${own.badge} ${own.badgeMissing}`}>Saknas</span>
            <span className={own.missingText}>Eleven har inte lämnat redovisningen</span>
          </article>
        ) : (
          <ReportCard key={entry.report.id} report={entry.report} questionId={questionId} />
        ),
      )}

      {visible.length > shown && (
        <button type="button" className={own.more} onClick={() => setShown(shown + REPORTS_PER_PAGE)}>
          Visa fler
        </button>
      )}
    </section>
  )
}

function ReportCard({ report, questionId }: { report: StudentReportSummary; questionId: string }) {
  const answers = (questionId ? report.answers.filter((a) => a.question_id === questionId) : report.answers).slice(0, 2)
  return (
    <Card>
      <article aria-labelledby={`report-${report.id}`}>
        <div className={own.reportBody}>
          <div className={own.reportTop}>
            <span id={`report-${report.id}`} className={own.reportDate}>
              {longDate(report.due_date)}
            </span>
            {!report.is_read && <span className={`${own.badge} ${own.badgeUnread}`}>Oläst</span>}
            {report.project && (
              <span className={`${own.badge} ${own.badgeProject}`}>
                <Folder aria-hidden="true" />
                {report.project.name}
              </span>
            )}
            <span className={own.sent}>Inskickad {dateTime(report.submitted_at)}</span>
          </div>
          {answers.map((answer, i) => (
            <div key={answer.question_id} className={i === 1 ? own.faded : undefined} aria-hidden={i === 1}>
              <p className={own.question}>{answer.question}</p>
              <p className={own.answer}>{answer.text}</p>
            </div>
          ))}
          {answers.length === 0 && <p className={own.muted}>Inga textsvar i den här redovisningen.</p>}
        </div>
        <div className={own.reportFooter}>
          <span className={own.muted}>
            {report.comment_count > 0 ? plural(report.comment_count, 'kommentar', 'kommentarer') : 'Inga kommentarer'}
            {report.class_name ? ` · ${report.class_name}` : ''}
          </span>
          <Link
            to={`/reports/${report.id}`}
            className={own.open}
            aria-label={`Öppna redovisningen för ${shortDate(report.due_date)}`}
          >
            Öppna
          </Link>
        </div>
      </article>
    </Card>
  )
}

// --- Högerkolumnen --------------------------------------------------------------------------

function attentionText(item: AttentionItem) {
  switch (item.reason) {
    case 'missing_check_ins':
      return { title: `Ej incheckad ${plural(item.count, 'dag', 'dagar')}`, text: 'De senaste fyra veckorna' }
    case 'missing_reports':
      return {
        title: `${plural(item.count, 'redovisning', 'redovisningar')} saknas`,
        text: 'Syns i listan till vänster',
      }
    case 'no_placement':
      return { title: 'Ingen praktikplats', text: 'Tilldelas i klassvyn' }
    case 'unsigned_contract':
      return { title: 'Kontraktet är inte signerat', text: `Väntar på ${waitingText(item)}` }
    case 'unconfirmed_days':
      return {
        title: `${plural(item.count, 'dag', 'dagar')} väntar på handledaren`,
        text: 'Incheckad men inte bekräftad',
      }
    case 'attendance_conflict':
      return {
        title: 'Närvaron stämmer inte',
        text: `Incheckad ${plural(item.count, 'dag', 'dagar')} som handledaren säger att eleven inte var där`,
      }
  }
}

const attentionIcon = {
  missing_check_ins: { icon: MapPinCheck, tone: 'sky' },
  missing_reports: { icon: FileText, tone: 'butter' },
  no_placement: { icon: BriefcaseBusiness, tone: 'mint' },
  unsigned_contract: { icon: FileSignature, tone: 'butter' },
  unconfirmed_days: { icon: MapPinCheck, tone: 'sky' },
  attendance_conflict: { icon: MapPinCheck, tone: 'sky' },
} as const

function AttentionBox({ studentId }: { studentId: string }) {
  const query = useStudentAttention(studentId)
  const items = query.data?.items ?? []
  if (items.length === 0) return null
  return (
    <section className={own.attention} aria-labelledby="attention-title">
      <h2 id="attention-title" className={own.attentionTitle}>
        Behöver uppmärksamhet
      </h2>
      <ul className={own.attentionList}>
        {items.map((item) => {
          const { icon: Icon, tone } = attentionIcon[item.reason]
          const text = attentionText(item)
          return (
            <li key={item.contract_id ?? item.reason} className={own.attentionItem}>
              <span className={`${own.iconBox} ${own[tone]}`}>
                <Icon aria-hidden="true" />
              </span>
              <span className={own.attentionText}>
                {item.contract_id ? (
                  <Link to={`/contracts/${item.contract_id}`} className={own.attentionName}>
                    {text.title}
                  </Link>
                ) : (
                  <span className={own.attentionName}>{text.title}</span>
                )}
                <span className={own.muted}>{text.text}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function AttendanceCard({ studentId }: { studentId: string }) {
  const query = useStudentAttendance(studentId)
  const [showAll, setShowAll] = useState(false)
  const data = query.data
  const summary = data?.summary
  const total = summary ? Math.max(summary.expected_days, summary.present) : 0
  const percent = summary && total > 0 ? Math.round((summary.present / total) * 100) : null
  const present = new Set(data?.days.filter((d) => d.status === 'present').map((d) => d.date))

  // Den här veckans APL-dagar för elevens klass.
  const today = todayIso()
  const monday = parseDay(weekStart(today))
  const aplDays = data?.apl_weekdays?.length ? data.apl_weekdays : [0, 1, 2, 3, 4]
  const week = aplDays.map((offset) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + offset)
    const iso = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '')
    const state = present.has(iso) ? 'present' : iso <= today ? 'missing' : 'future'
    return { iso, label: label.charAt(0).toUpperCase() + label.slice(1), state }
  })

  return (
    <Card>
      <div className={own.sideCard}>
        <div className={own.sideHead}>
          <span className={`${own.iconBox} ${own.sky}`}>
            <CalendarCheck aria-hidden="true" />
          </span>
          <h2 className={own.sideTitle}>Närvaro</h2>
          {data && <span className={own.sideMeta}>Sedan {shortDate(data.from_date)}</span>}
        </div>
        {query.isPending && <p className={own.muted}>Laddar…</p>}
        {data && !summary?.has_placement && <p className={own.muted}>Eleven har ingen praktikplats under perioden.</p>}
        {data && summary?.has_placement && (
          <>
            <div className={own.bigNumber}>
              <span className={own.percent}>{percent === null ? '–' : `${percent}%`}</span>
              <span className={own.muted}>
                {summary.present} av {plural(total, 'dag', 'dagar')}
              </span>
            </div>
            <SegmentedBar
              present={summary.present}
              absent={0}
              total={total}
              label={`${summary.present} av ${total} dagar incheckad`}
            />
            <div className={own.week}>
              <span className={own.weekTitle}>Den här veckan</span>
              <ul className={own.weekDays} style={{ gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))` }}>
                {week.map((day) => (
                  <li key={day.iso} className={own.weekDay}>
                    {day.label}
                    <span
                      className={`${own.dot} ${own[day.state]}`}
                      aria-label={
                        day.state === 'present' ? 'Incheckad' : day.state === 'missing' ? 'Ej incheckad' : 'Kommande'
                      }
                      role="img"
                    />
                  </li>
                ))}
              </ul>
            </div>
            {data.days.length > 0 && (
              <button type="button" className={own.textLink} onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Dölj dagarna' : `Visa alla ${plural(data.days.length, 'incheckning', 'incheckningar')}`}
              </button>
            )}
            {showAll && (
              <ul className={own.dayList}>
                {data.days.map((day) => (
                  <li key={day.date}>
                    <span>{shortDate(day.date)}</span>
                    <span className={own.muted}>
                      {day.checked_in_at
                        ? new Date(day.checked_in_at).toLocaleTimeString('sv-SE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

function PlacementCard({ studentId }: { studentId: string }) {
  const query = useStudentPlacements(studentId)
  // currentPlacement vill ha listan i datumordning, API:t ger senaste först.
  const placements = [...(query.data ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const current = currentPlacement(placements)
  const others = placements.filter((p) => p.id !== current?.id)
  const status = current ? periodStatus(current.start_date, current.end_date) : null

  return (
    <Card>
      <div className={own.sideCard}>
        <div className={own.sideHead}>
          <span className={`${own.iconBox} ${own.mint}`}>
            <BriefcaseBusiness aria-hidden="true" />
          </span>
          <h2 className={own.sideTitle}>Praktikplats</h2>
        </div>
        {query.isPending && <p className={own.muted}>Laddar…</p>}
        {query.isSuccess && !current && (
          <p className={own.muted}>Eleven har ingen praktikplats. Den tilldelas i klassvyn.</p>
        )}
        {current && (
          <>
            <div>
              <p className={own.company}>{current.workplace.name}</p>
              {current.workplace.address && (
                <p className={own.address}>
                  <MapPin aria-hidden="true" />
                  {current.workplace.address}
                </p>
              )}
            </div>
            <div className={own.progress}>
              <div className={own.progressTop}>
                <span>{periodText(current.start_date, current.end_date)}</span>
                {status === 'active' && (
                  <span className={own.mintText}>
                    Vecka {periodWeek(current.start_date, current.end_date).week} av{' '}
                    {periodWeek(current.start_date, current.end_date).weeks}
                  </span>
                )}
              </div>
              <div
                className={own.track}
                role="img"
                aria-label={`${Math.round(periodProgress(current.start_date, current.end_date) * 100)} procent av perioden`}
              >
                <div
                  className={own.fill}
                  style={{ width: `${Math.round(periodProgress(current.start_date, current.end_date) * 100)}%` }}
                />
              </div>
              <span className={own.mutedSmall}>{periodCountdown(current.start_date, current.end_date)}</span>
            </div>
            <div className={own.supervisor}>
              <Avatar name={current.supervisor.name} size="sm" color="yellow" />
              <span className={own.supervisorText}>
                <span className={own.supervisorName}>{current.supervisor.name}</span>
                <span className={own.muted}>Handledare</span>
                <a href={`mailto:${current.supervisor.email}`} className={own.email}>
                  {current.supervisor.email}
                </a>
              </span>
            </div>
          </>
        )}
        {others.length > 0 && (
          <div className={own.others}>
            <span className={own.weekTitle}>Andra placeringar</span>
            <ul>
              {others.map((p) => (
                <li key={p.id}>
                  <span>{p.workplace.name}</span>
                  <span className={own.muted}>{periodText(p.start_date, p.end_date)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}

function ProjectsCard({ studentId }: { studentId: string }) {
  const query = useStudentProjects(studentId)
  const projects = query.data ?? []
  return (
    <Card>
      <div className={own.sideCard}>
        <div className={own.sideHead}>
          <span className={`${own.iconBox} ${own.lilac}`}>
            <Folder aria-hidden="true" />
          </span>
          <h2 className={own.sideTitle}>Projekt</h2>
          <Link to="/projects" className={own.sideLink}>
            Alla projekt
          </Link>
        </div>
        {query.isPending && <p className={own.muted}>Laddar…</p>}
        {query.isSuccess && projects.length === 0 && <p className={own.muted}>Eleven är inte med i något projekt.</p>}
        {projects.length > 0 && (
          <ul className={own.projectList}>
            {projects.map((project) => (
              <li key={project.id}>
                <span className={own.projectName}>{project.name}</span>
                <span className={own.muted}>
                  {plural(project.report_count, 'redovisning', 'redovisningar')}
                  {project.deadline ? ` · klart ${shortDate(project.deadline)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function TeachersEditor({ student, schoolId }: { student: Student; schoolId?: string | null }) {
  const saved = student.teachers.map((t) => t.id)
  const [selected, setSelected] = useState<string[]>(saved)
  const [done, setDone] = useState(false)
  const teachers = useSchoolTeachers(schoolId, true)
  const setTeachers = useSetTeachers(student.id)
  const changed = selected.length !== saved.length || selected.some((id) => !saved.includes(id))

  return (
    <Card>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Lärare</h2>
        <span className={styles.count}>{student.teachers.length}</span>
      </div>
      <div className={styles.cardBody} style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <CheckList
          legend="Lärare som ser eleven och kan lägga hen i sina klasser"
          options={(teachers.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
          selected={selected}
          onChange={(next) => {
            setSelected(next)
            setDone(false)
          }}
          emptyText={teachers.isPending ? 'Hämtar lärare…' : 'Skolan har inga lärare än.'}
        />
        {setTeachers.isError && (
          <p className={styles.formError} role="alert" style={{ marginTop: 0 }}>
            {setTeachers.error.message}
          </p>
        )}
        <div className={styles.formActions} style={{ alignItems: 'center' }}>
          <Button
            variant="primary"
            disabled={!changed || setTeachers.isPending}
            onClick={() => setTeachers.mutate(selected, { onSuccess: () => setDone(true) })}
          >
            Spara lärare
          </Button>
          {done && !changed && (
            <span className={styles.formSuccess} role="status" style={{ marginTop: 0 }}>
              Sparat.
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

// --- Anteckningar från handledaren (B18, Texas 2026-10-30) ----------------------------------

const NOTES_SHOWN = 3

/** Handledarens anteckningar om eleven. Läraren läser men skriver inte. Eleven ser dem inte. */
function NotesCard({ studentId }: { studentId: string }) {
  const query = useStudentNotes(studentId)
  const [showAll, setShowAll] = useState(false)
  const notes = query.data ?? []
  if (query.isSuccess && notes.length === 0) return null
  const counts = (['praise', 'concern', 'other'] as NoteTag[])
    .map((tag) => ({ tag, count: notes.filter((n) => n.tag === tag).length }))
    .filter((c) => c.count > 0)
  return (
    <Card>
      <div className={own.sideCard}>
        <div className={own.sideHead}>
          <span className={`${own.iconBox} ${own.butter}`}>
            <NotebookPen aria-hidden="true" />
          </span>
          <h2 className={own.sideTitle}>Från handledaren</h2>
          <span className={own.sideMeta}>{plural(notes.length, 'anteckning', 'anteckningar')}</span>
        </div>
        {query.isPending && <p className={own.muted}>Laddar…</p>}
        {counts.length > 0 && (
          <p className={own.muted}>{counts.map((c) => `${noteTagLabel[c.tag]} ${c.count}`).join(' · ')}</p>
        )}
        {(showAll ? notes : notes.slice(0, NOTES_SHOWN)).map((note) => (
          <NoteItem key={note.id} note={note} studentId={studentId} showRole clamp />
        ))}
        {notes.length > NOTES_SHOWN && (
          <button type="button" className={own.textLink} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Visa färre' : `Visa alla ${notes.length}`}
          </button>
        )}
        <p className={own.mutedSmall}>
          <Lock aria-hidden="true" className={own.inlineIcon} /> Bara du och handledaren ser anteckningarna.
        </p>
      </div>
    </Card>
  )
}
