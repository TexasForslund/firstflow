import { useMutation } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { api } from '../api/client'
import { queryClient } from '../api/queryClient'
import { classes, studentsInClass } from '../demo/data'
import { AppShell } from '../layout/AppShell'
import { navByRole, startPath, type Role } from './roles'
import { useCurrentUser } from './useCurrentUser'
import styles from './RequireAuth.module.css'

// Lärarens klasser i sidomenyn kommer från demodatan tills B2/F3 är klara.
const demoClasses = classes.map((c) => ({ id: c.id, name: c.name, count: studentsInClass(c.id).length }))

/** Skyddar alla sidor i appen. Ej inloggad skickas till /login. */
export function RequireAuth() {
  const me = useCurrentUser()
  const location = useLocation()
  const navigate = useNavigate()

  const logout = useMutation({
    mutationFn: () => api.POST('/api/auth/logout'),
    onSettled: () => {
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  if (me.isPending) {
    return (
      <div className={styles.loading} role="status">
        Laddar…
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className={styles.loading} role="alert">
        Det går inte att nå Firstflow just nu. Ladda om sidan om en stund.
      </div>
    )
  }
  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  const user = me.data
  return (
    <AppShell
      userName={user.name}
      nav={navByRole[user.role]}
      classes={user.role === 'teacher' ? demoClasses : undefined}
      onLogout={() => logout.mutate()}
    />
  )
}

/** Visar sidan bara för vissa roller. Andra skickas till sin egen startsida. */
export function RoleRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data: user } = useCurrentUser()
  if (!user) return null
  if (!roles.includes(user.role)) return <Navigate to={startPath[user.role]} replace />
  return children
}

/** Skickar "/" vidare till rollens startsida. */
export function RoleHome() {
  const { data: user } = useCurrentUser()
  return user ? <Navigate to={startPath[user.role]} replace /> : null
}
