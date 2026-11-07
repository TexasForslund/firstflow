import { Link } from 'react-router'

import { useAddProjectComment, useProjectComments, useProjectImages, type Project } from '../../api/projects'
import { reportImageUrl } from '../../api/reportImages'
import { CommentThread } from '../reports/AnswerView'
import { Gallery } from '../reports/ImageGallery'
import styles from './ProjectPage.module.css'
import { longDate } from './projectText'

/** Bilderna från redovisningarna i projektet (Texas skiss, 2026-11-07). */
export function ImagesTab({
  project,
  studentId,
  reportPath,
}: {
  project: Project
  studentId?: string
  reportPath: (id: string) => string
}) {
  const query = useProjectImages(project.id)
  const rows = (query.data ?? []).filter((r) => !studentId || r.student.id === studentId)
  if (query.isPending) return <p className={styles.muted}>Hämtar bilder…</p>
  if (query.isError) return <p className={styles.muted}>Bilderna gick inte att hämta.</p>
  if (rows.length === 0) {
    return (
      <p className={styles.emptyBox}>
        Inga bilder än. De dyker upp här när eleven skickar en redovisning med bilder i projektet.
      </p>
    )
  }
  return (
    <section aria-label="Bilder">
      <p className={styles.muted}>Bilder från redovisningarna. Klicka för att se större.</p>
      <Gallery
        large
        images={rows.map((r) => ({
          id: r.image_id,
          src: reportImageUrl(r.report_id, r.image_id),
          caption: (
            <>
              {r.student.name} · {longDate(r.due_date)} · <Link to={reportPath(r.report_id)}>Öppna redovisningen</Link>
            </>
          ),
        }))}
      />
    </section>
  )
}

/**
 * Kommentarer om elevernas arbete i projektet, från läraren och handledaren. De kan skrivas
 * under hela projektet. En tråd per elev (Texas, 2026-11-07).
 */
export function CommentsTab({ project, studentId }: { project: Project; studentId?: string }) {
  const query = useProjectComments(project.id)
  const add = useAddProjectComment(project.id)
  const students = project.students.filter((s) => !studentId || s.id === studentId)
  if (query.isPending) return <p className={styles.muted}>Hämtar kommentarer…</p>
  if (students.length === 0) return <p className={styles.emptyBox}>Inga elever i projektet än.</p>
  return (
    <div className={styles.threads}>
      {students.map((s) => {
        const firstName = s.name.split(' ')[0]
        return (
          <div key={s.id} className={styles.thread}>
            <CommentThread
              id={`project-${s.id}`}
              title={studentId ? `Kommentarer om ${firstName}s arbete i projektet` : s.name}
              placeholder={`Skriv en kommentar om ${firstName}…`}
              comments={(query.data ?? []).filter((c) => c.student.id === s.id)}
              pending={add.isPending && add.variables?.student_id === s.id}
              error={add.isError && add.variables?.student_id === s.id ? add.error.message : undefined}
              onSend={(body, visibility, done) =>
                add.mutate({ student_id: s.id, body, visibility }, { onSuccess: done })
              }
            />
          </div>
        )
      })}
    </div>
  )
}
