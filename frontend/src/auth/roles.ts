import type { components } from '../api/schema'
import { unreadMessages } from '../demo/data'
import type { NavItem } from '../layout/AppShell'
import { navIcons } from '../layout/navIcons'

export type Role = components['schemas']['UserRole']

export const roleLabel: Record<Role, string> = {
  superadmin: 'Superadmin',
  school_admin: 'Skoladministratör',
  principal: 'Rektor',
  syv: 'Studie- och yrkesvägledare',
  teacher: 'Lärare',
  student: 'Elev',
  supervisor: 'Handledare',
}

/** Startsidan för varje roll. Dit skickas användaren efter inloggning. */
export const startPath: Record<Role, string> = {
  superadmin: '/admin/schools',
  school_admin: '/students',
  principal: '/school',
  syv: '/students',
  teacher: '/overview',
  student: '/my-reports',
  supervisor: '/my-students',
}

const {
  overview,
  messages,
  history,
  projects,
  placements,
  contracts,
  users,
  schools,
  students,
  reports,
  checkIn,
  classes,
  myReports,
} = navIcons

// Lärarens meny i tre grupper enligt Texas skiss (2026-10-26). Meddelanden och Kontrakt har siffror
// från demodatan tills de är byggda. Översiktens siffra och Närvarons "3/5" sätts i RequireAuth
// från lärarens översikt.
export const navByRole: Record<Role, NavItem[]> = {
  teacher: [
    {
      group: 'I dag',
      to: '/overview',
      label: 'Översikt',
      icon: overview,
      countLabel: 'att följa upp',
      tone: 'attention',
    },
    { group: 'I dag', to: '/attendance', label: 'Närvaro', icon: checkIn },
    {
      group: 'I dag',
      to: '/messages',
      label: 'Meddelanden',
      icon: messages,
      count: unreadMessages,
      countLabel: 'olästa',
    },
    { group: 'Elever', to: '/student-history', label: 'Elevhistorik', icon: history, classesAfter: true },
    { group: 'APL', to: '/placements', label: 'Praktikplatser', icon: placements },
    { group: 'APL', to: '/projects', label: 'Projekt', icon: projects },
    {
      group: 'APL',
      to: '/contracts',
      label: 'Kontrakt',
      icon: contracts,
    },
  ],
  supervisor: [
    { to: '/my-students', label: 'Mina elever', icon: students },
    { to: '/attendance-review', label: 'Närvaro', icon: checkIn },
    { to: '/student-reports', label: 'Redovisningar', icon: reports },
    { to: '/projects', label: 'Projekt', icon: projects },
    { to: '/company', label: 'Företag', icon: placements },
    { to: '/messages', label: 'Meddelanden', icon: messages },
    { to: '/contracts', label: 'Kontrakt', icon: contracts },
  ],
  student: [
    { to: '/my-reports', label: 'Redovisning', icon: myReports },
    { to: '/my-apl', label: 'Min APL', icon: placements },
    { to: '/check-in', label: 'Incheckning', icon: checkIn },
    { to: '/messages', label: 'Meddelanden', icon: messages },
  ],
  school_admin: [
    { to: '/students', label: 'Elever', icon: students },
    { to: '/classes', label: 'Klasser', icon: classes },
    { to: '/users', label: 'Användare', icon: users },
    { to: '/placements', label: 'Praktikplatser', icon: placements },
    { to: '/contracts', label: 'Kontrakt', icon: contracts },
    { to: '/admin-reports', label: 'Rapporter', icon: reports },
  ],
  principal: [
    { to: '/school', label: 'Översikt', icon: overview },
    { to: '/students', label: 'Elever', icon: students },
    { to: '/classes', label: 'Klasser', icon: classes },
    { to: '/users', label: 'Användare', icon: users },
    { to: '/admin-reports', label: 'Rapporter', icon: reports },
  ],
  syv: [
    { to: '/students', label: 'Elever', icon: students },
    { to: '/messages', label: 'Meddelanden', icon: messages },
  ],
  superadmin: [{ to: '/admin/schools', label: 'Skolor', icon: schools }],
}
