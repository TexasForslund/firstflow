import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { api } from '../../api/client'
import { queryClient } from '../../api/queryClient'
import { startPath } from '../../auth/roles'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Button, Logo, TextField } from '../../components'
import styles from './Login.module.css'

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const me = useCurrentUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: async () => {
      const { data, response } = await api.POST('/api/auth/login', { body: { email, password } })
      if (response.status === 401) throw new Error('wrong-credentials')
      if (!data) throw new Error('unavailable')
      return data
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? startPath[user.role], { replace: true })
    },
  })

  if (me.data) return <Navigate to={startPath[me.data.role]} replace />

  function submit(event: FormEvent) {
    event.preventDefault()
    login.mutate()
  }

  const error =
    login.error?.message === 'wrong-credentials'
      ? 'Fel e-post eller lösenord.'
      : login.error
        ? 'Det gick inte att logga in just nu. Försök igen om en stund.'
        : undefined

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <Logo height={36} />
        <div className={styles.intro}>
          <h1 className={styles.title}>Logga in</h1>
          <p className={styles.subtitle}>Använd kontot du har fått från din skola.</p>
        </div>

        <form className={styles.form} onSubmit={submit} noValidate>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <TextField
            label="E-post"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Lösenord"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="primary" className={styles.submit} disabled={login.isPending}>
            {login.isPending ? 'Loggar in…' : 'Logga in'}
          </Button>
        </form>

        <p className={styles.note}>
          Har du inget konto? Konton skapas av din skola. Kontakta skolans administratör eller din lärare.
        </p>
      </div>
    </main>
  )
}
