import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { useCreateClass } from '../../api/classes'
import { suggestCurriculum, type Curriculum } from '../../api/syllabus'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Button, Card, TextField } from '../../components'
import styles from './Classes.module.css'
import { CurriculumField, ProgramFields } from './ProgramFields'

export function NewClass() {
  const navigate = useNavigate()
  const { data: user } = useCurrentUser()
  const [name, setName] = useState('')
  // Läroplanen gissas utifrån året i namnet tills den som skapar klassen väljer själv.
  const [picked, setPicked] = useState<Curriculum | null>(null)
  const [program, setProgram] = useState('')
  const curriculum = picked ?? suggestCurriculum(name)
  const create = useCreateClass()

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate(
      { name, curriculum, program_code: user?.role === 'teacher' ? null : program || null },
      { onSuccess: (created) => navigate(`/classes/${created.id}`) },
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Skapa klass</h1>
        <p className={styles.subtitle}>
          {user?.role === 'teacher'
            ? 'Du blir lärare för klassen och kan lägga till elever direkt.'
            : 'Klassen skapas på skolan. Koppla lärare och elever när den är skapad.'}
        </p>
      </header>
      <Card>
        <div className={styles.cardBody}>
          <form className={styles.formSingle} onSubmit={submit}>
            {create.isError && (
              <p className={styles.formError} role="alert">
                {create.error.message}
              </p>
            )}
            <TextField
              label="Klassens namn"
              name="name"
              placeholder="t.ex. EE23"
              required
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {user?.role === 'teacher' ? (
              <>
                <CurriculumField
                  curriculum={curriculum}
                  hint={picked ? undefined : 'Gissat utifrån klassens namn.'}
                  onChange={setPicked}
                />
                <p className={styles.formHint}>
                  {user.program_name
                    ? `Program: ${user.program_name}. Skoladministratören har kopplat dig till programmet.`
                    : 'Skoladministratören har inte kopplat dig till ett program än. Klassen får programmet när det är gjort.'}
                </p>
              </>
            ) : (
              <ProgramFields
                curriculum={curriculum}
                program={program}
                hint={picked ? undefined : 'Gissat utifrån klassens namn.'}
                onChange={(c, p) => {
                  setPicked(c)
                  setProgram(p)
                }}
              />
            )}
            <div>
              <Button type="submit" variant="primary" disabled={create.isPending || !name.trim()}>
                Skapa klass
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  )
}
