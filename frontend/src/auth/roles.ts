import type { components } from '../api/schema'
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
  upload,
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
    { group: 'I dag', to: '/messages', label: 'Meddelanden', icon: messages },
    { group: 'Elever', to: '/reports', label: 'Redovisningar', icon: reports, classesAfter: true },
    { group: 'APL', to: '/placements', label: 'Praktikplatser', icon: placements },
    { group: 'APL', to: '/projects', label: 'Projekt', icon: projects },
    {
      group: 'APL',
      to: '/contracts',
      label: 'Kontrakt',
      icon: contracts,
    },
  ],
  // Handledarens meny i tre grupper (Texas, 2026-11-03). I mobilen en flikrad med Mer.
  supervisor: [
    { group: 'I dag', to: '/my-students', label: 'Översikt', icon: overview, tab: true },
    { group: 'I dag', to: '/attendance-review', label: 'Närvaro', icon: checkIn, tab: true },
    { group: 'I dag', to: '/messages', label: 'Meddelanden', icon: messages, tab: true },
    { group: 'Elever', to: '/student-reports', label: 'Redovisningar', icon: reports, tab: true },
    { group: 'Elever', to: '/projects', label: 'Projekt', icon: projects },
    { group: 'Elever', to: '/contracts', label: 'Kontrakt', icon: contracts },
    { group: 'Företag', to: '/company', label: 'Företagsprofil', icon: placements },
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
    { to: '/import', label: 'Importera', icon: upload },
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
