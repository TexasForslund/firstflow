import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { useCreateClass } from '../../api/classes'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Button, Card, TextField } from '../../components'
import styles from './Classes.module.css'

export function NewClass() {
  const navigate = useNavigate()
  const { data: user } = useCurrentUser()
  const [name, setName] = useState('')
  const create = useCreateClass()

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate(name, { onSuccess: (created) => navigate(`/classes/${created.id}`) })
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
