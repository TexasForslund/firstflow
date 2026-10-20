import { createBrowserRouter, createHashRouter, Navigate, RouterProvider } from 'react-router'

import { attention, classes, contractsToSign, studentsInClass, teacher, unreadMessages } from './demo/data'
import { AppShell, type NavItem } from './layout/AppShell'
import { navIcons } from './layout/navIcons'
import { Placeholder } from './pages/Placeholder'
import { Overview } from './pages/teacher/Overview'
import { StudentHistory } from './pages/teacher/StudentHistory'
import { WeeklyReport } from './pages/teacher/WeeklyReport'

// Lärarens meny. Siffrorna kommer från demodatan tills backend finns (F2/F3).
const teacherNav: NavItem[] = [
  { to: '/overview', label: 'Översikt', icon: navIcons.overview, count: attention.length, countLabel: 'att följa upp' },
  { to: '/messages', label: 'Meddelanden', icon: navIcons.messages, count: unreadMessages, countLabel: 'olästa' },
  { to: '/student-history', label: 'Elevhistorik', icon: navIcons.history },
  { to: '/projects', label: 'Projekt', icon: navIcons.projects },
  { to: '/placements', label: 'Praktikplatser', icon: navIcons.placements },
  { to: '/contracts', label: 'Kontrakt', icon: navIcons.contracts, count: contractsToSign, countLabel: 'att signera' },
]

const sidebarClasses = classes.map((c) => ({ id: c.id, name: c.name, count: studentsInClass(c.id).length }))

const routes = [
  {
    path: '/',
    element: (
      <AppShell
        userName={teacher.name}
        nav={teacherNav}
        classes={sidebarClasses}
        onLogout={() => window.alert('Utloggning kommer i F2')}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: 'overview', element: <Overview /> },
      { path: 'reports/:reportId', element: <WeeklyReport /> },
      { path: 'student-history', element: <StudentHistory /> },
      {
        path: 'reports',
        element: <Placeholder title="Veckoredovisningar" description="Alla veckoredovisningar, med filter per klass, elev och vecka." />,
      },
      { path: 'messages', element: <Placeholder title="Meddelanden" description="Meddelanden mellan lärare, elever och handledare." /> },
      { path: 'projects', element: <Placeholder title="Projekt" description="Projekt som tilldelas elever och kopplas till veckoredovisningar." /> },
      { path: 'placements', element: <Placeholder title="Praktikplatser" description="Arbetsplatser, handledare och vilka elever som är där." /> },
      { path: 'contracts', element: <Placeholder title="Kontrakt" description="Utbildningskontrakt och APL-avtal att signera." /> },
      { path: 'students/:studentId', element: <Placeholder title="Elev" description="Elevens sida med APL, närvaro och redovisningar." /> },
      { path: 'classes/new', element: <Placeholder title="Skapa klass" description="Formulär för en ny klass kommer i F3." /> },
      { path: 'settings', element: <Placeholder title="Inställningar" description="Konto och aviseringar." /> },
      { path: '*', element: <Placeholder title="Sidan finns inte" description="Kontrollera adressen eller gå tillbaka till översikten." /> },
    ],
  },
]

// Demobygget publiceras som en statisk sida och använder därför #-adresser.
const router = import.meta.env.VITE_HASH_ROUTER === '1' ? createHashRouter(routes) : createBrowserRouter(routes)

export default function App() {
  return <RouterProvider router={router} />
}
