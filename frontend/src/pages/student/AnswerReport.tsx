import { Navigate, useNavigate, useParams } from 'react-router'

import { useMyProjects } from '../../api/projects'
import { useReport, useSaveAnswer, useSubmitReport } from '../../api/reports'
import { Button } from '../../components'
import { NotFound } from '../NotFound'
import { reportTitle } from '../reports/answers'
import { ReportStepper } from '../reports/ReportStepper'
import { ProjectStep } from './ProjectStep'
import styles from './Student.module.css'

/** Eleven svarar på redovisningen, en fråga i taget. Svaret sparas vid varje Nästa. */
export function AnswerReport() {
  const { reportId = '' } = useParams()
  const navigate = useNavigate()
  const report = useReport(reportId)
  const save = useSaveAnswer(reportId)
  const submit = useSubmitReport(reportId)
  const projects = useMyProjects()

  const projectList = projects.data ?? []

  if (report.isPending || projects.isPending) return <p className={styles.state}>Laddar…</p>
  if (report.isError) return <NotFound what="Redovisningen" />
  const detail = report.data
  // En inskickad redovisning visas som inlägg. Den kan inte ändras.
  if (detail.status === 'submitted' && !submit.isSuccess) return <Navigate to={`/my-reports/${reportId}`} replace />

  const initialAnswers = Object.fromEntries(detail.answers.map(({ question_id, ...value }) => [question_id, value]))

  return (
    <ReportStepper
      title={reportTitle(detail.due_date)}
      subtitle={detail.class_name}
      questions={detail.questions}
      initialAnswers={initialAnswers}
      onSave={async (questionId, value) => {
        await save.mutateAsync({ questionId, value })
      }}
      onSubmit={async () => {
        await submit.mutateAsync()
      }}
      onClose={() => navigate('/my-reports')}
      finalStep={
        projectList.length > 0
          ? {
              content: (
                <ProjectStep reportId={reportId} projects={projectList} projectId={detail.project?.id ?? null} />
              ),
              submitLabel: detail.project ? `Skicka in till ${detail.project.name}` : 'Skicka in',
            }
          : undefined
      }
      done={{
        title: 'Tack!',
        body: 'Din redovisning är inskickad. Din lärare kan nu läsa och kommentera den.',
        actions: (
          <>
            <Button variant="primary" onClick={() => navigate(`/my-reports/${reportId}`, { replace: true })}>
              Se din redovisning
            </Button>
            <Button onClick={() => navigate('/my-reports', { replace: true })}>Till startsidan</Button>
          </>
        ),
      }}
    />
  )
}
