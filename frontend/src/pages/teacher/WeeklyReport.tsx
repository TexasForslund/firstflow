import { ArrowUpRight, ExternalLink, ImageIcon } from 'lucide-react'
import { useParams } from 'react-router'

import {
  Avatar,
  ButtonLink,
  Card,
  CardFooter,
  ChoiceChips,
  Collapsible,
  SegmentedBar,
  StarRating,
  Tag,
} from '../../components'
import { classById, reportById, studentById, type DemoAnswer } from '../../demo/data'
import styles from './WeeklyReport.module.css'

export function WeeklyReport() {
  const { reportId = '' } = useParams()
  const report = reportById(reportId)
  const student = report ? studentById(report.studentId) : undefined

  if (!report || !student) {
    return (
      <div>
        <h1 className={styles.title}>Redovisningen finns inte</h1>
        <p className={styles.missing}>Den kan ha tagits bort, eller så har du inte behörighet att se den.</p>
      </div>
    )
  }

  const cls = classById(student.classId)
  // Demodata: närvaroperioden räknas som 50 dagar.
  const presentDays = Math.round(student.attendancePercent / 2)
  const absentDays = Math.min(4, 50 - presentDays)

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            Redovisning <span className={styles.week}>V{report.week}</span>
          </h1>
          <ButtonLink to="/reports" icon={<ArrowUpRight aria-hidden="true" />}>
            Se alla
          </ButtonLink>
        </div>
        <p className="sr-only">
          Från {student.name}, {cls?.name}, inlämnad {report.submittedAt.toLowerCase()}
        </p>

        <Card>
          <div className={styles.projectBar}>
            <span>Projekt:</span>
            <Tag>{report.project}</Tag>
          </div>
          <div className={styles.answers}>
            {report.answers.map((answer) => (
              <Collapsible key={answer.question} title={answer.question}>
                <Answer answer={answer} />
              </Collapsible>
            ))}
          </div>
        </Card>
      </div>

      <aside className={styles.side} aria-label={`Om ${student.name}`}>
        <Card>
          <div className={styles.sideBody}>
            <div className={styles.studentHeader}>
              <Avatar name={student.name} color="yellow" />
              <span className={styles.studentName}>{student.name}</span>
              <span className={styles.studentClass}>{cls?.name}</span>
            </div>

            <div className={styles.bigNumber}>
              <span className={styles.percent}>{student.attendancePercent}%</span>
              <span className={styles.bigNumberLabel}>snitt närvaro</span>
            </div>
            <SegmentedBar
              present={presentDays}
              absent={absentDays}
              total={presentDays + absentDays + 1}
              label={`Närvaro ${student.attendancePercent} procent`}
            />

            <h2 className={styles.sideHeading}>Praktikplats kopplad till {student.name.split(' ')[0]}</h2>
            {student.workplace.url ? (
              <a href={student.workplace.url} target="_blank" rel="noreferrer" className={styles.workplace}>
                <span className={styles.workplaceIcon} aria-hidden="true">
                  {student.workplace.name[0]}
                </span>
                <span className={styles.workplaceName}>{student.workplace.name}</span>
                <ExternalLink aria-hidden="true" />
                <span className="sr-only">(öppnas i ny flik)</span>
              </a>
            ) : (
              <span className={styles.workplace}>
                <span className={styles.workplaceIcon} aria-hidden="true">
                  {student.workplace.name[0]}
                </span>
                <span className={styles.workplaceName}>{student.workplace.name}</span>
              </span>
            )}

            <h2 className={styles.sideHeading}>Projekt kopplade till {student.name.split(' ')[0]}</h2>
            <div className={styles.tags}>
              {student.projects.map((p) => (
                <Tag key={p}>{p}</Tag>
              ))}
            </div>
          </div>
          <CardFooter>
            <ButtonLink to={`/reports?view=students&student=${student.id}`} icon={<ArrowUpRight aria-hidden="true" />}>
              Se historik
            </ButtonLink>
          </CardFooter>
        </Card>
      </aside>
    </div>
  )
}

function Answer({ answer }: { answer: DemoAnswer }) {
  switch (answer.type) {
    case 'text':
      return <p>{answer.text}</p>
    case 'images':
      return (
        <ul className={styles.images}>
          {answer.images?.map((image) => (
            <li key={image.caption} className={styles.image}>
              <ImageIcon aria-hidden="true" />
              <span>{image.caption}</span>
            </li>
          ))}
        </ul>
      )
    case 'choice':
      return <ChoiceChips options={answer.options ?? []} value={answer.value} label={answer.question} />
    case 'rating':
      return <StarRating value={answer.rating ?? 0} label={answer.question} />
  }
}
