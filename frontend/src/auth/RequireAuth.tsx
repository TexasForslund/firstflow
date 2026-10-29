import { useMutation } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { api } from '../api/client'
import { queryClient } from '../api/queryClient'
import { useClasses } from '../api/classes'
import { useReviewList } from '../api/attendance'
import { useContracts } from '../api/contracts'
import { useTeacherOverview } from '../api/overview'
import { AppShell } from '../layout/AppShell'
import { CheckInPrompt } from '../pages/student/CheckInPrompt'
import { applyPreferences } from './preferences'
import { navByRole, roleLabel, startPath, type Role } from './roles'
import { useCurrentUser } from './useCurrentUser'
import styles from './RequireAuth.module.css'

/** Skyddar alla sidor i appen. Ej inloggad skickas till /login. */
export function RequireAuth() {
  const me = useCurrentUser()
  const location = useLocation()
  const navigate = useNavigate()
  const isTeacher = me.data?.role === 'teacher'
  const classes = useClasses(isTeacher)
  const overview = useTeacherOverview(isTeacher)
  const role = me.data?.role
  const contracts = useContracts(role === 'teacher' || role === 'supervisor' || role === 'student')
  const review = useReviewList(role === 'supervisor')
  const preferences = me.data?.preferences

  // Användarens visningsinställningar gäller på alla enheter.
  useEffect(() => {
    if (preferences) applyPreferences(preferences)
  }, [preferences])

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
      userSubtitle={[roleLabel[user.role], user.school_name].filter(Boolean).join(' · ')}
      nav={navByRole[user.role].map((item) => {
        const data = overview.data
        if (item.to === '/overview') return { ...item, count: data?.attention.length }
        // Handledaren: dagar att bekräfta, i dag och tidigare.
        if (item.to === '/attendance-review') {
          const r = review.data
          const count = r
            ? r.today_items.filter((i) => i.state === 'pending').length +
              r.earlier.filter((i) => i.state === 'pending').length
            : 0
          return { ...item, count, countLabel: 'att bekräfta', tone: 'butter' as const }
        }
        // Läraren: kontrakt som väntar på signering. Elev och handledare: kontrakt som väntar på dem.
        if (item.to === '/contracts') {
          const list = contracts.data ?? []
          const count = isTeacher
            ? list.filter((c) => c.status === 'waiting').length
            : list.filter((c) => c.my_turn).length
          return {
            ...item,
            count,
            countLabel: isTeacher ? 'väntar på signering' : 'att signera',
            tone: 'butter' as const,
          }
        }
        // Dagens incheckningar, t.ex. "3/5". Bara när någon har APL i dag.
        if (item.to === '/attendance' && isTeacher && data && data.on_apl > 0) {
          return { ...item, meta: `${data.checked_in}/${data.on_apl}` }
        }
        return item
      })}
      classes={
        isTeacher ? (classes.data ?? []).map((c) => ({ id: c.id, name: c.name, count: c.student_count })) : undefined
      }
      onLogout={() => logout.mutate()}
      tabBar={user.role === 'student'}
      top={user.role === 'student' ? <CheckInPrompt firstName={user.name.split(' ')[0]} /> : undefined}
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
