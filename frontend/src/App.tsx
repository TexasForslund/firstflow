import type { ReactNode } from 'react'
import { createBrowserRouter, createHashRouter, RouterProvider, type RouteObject } from 'react-router'

import { RequireAuth, RoleHome, RoleRoute } from './auth/RequireAuth'
import type { Role } from './auth/roles'
import { Login } from './pages/auth/Login'
import { ClassList } from './pages/classes/ClassList'
import { ClassPage } from './pages/classes/ClassPage'
import { NewClass } from './pages/classes/NewClass'
import { StudentList } from './pages/students/StudentList'
import { StudentPage } from './pages/students/StudentPage'
import { Placeholder } from './pages/Placeholder'
import { Overview } from './pages/teacher/Overview'
import { StudentHistory } from './pages/teacher/StudentHistory'
import { WeeklyReport } from './pages/teacher/WeeklyReport'

const staff: Role[] = ['teacher']
const anyRole: Role[] = ['superadmin', 'school_admin', 'principal', 'syv', 'teacher', 'student', 'supervisor']

function only(roles: Role[], element: ReactNode) {
  return <RoleRoute roles={roles}>{element}</RoleRoute>
}

function placeholder(path: string, roles: Role[], title: string, description: string): RouteObject {
  return { path, element: only(roles, <Placeholder title={title} description={description} />) }
}

const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      { index: true, element: <RoleHome /> },

      // Lärare (demodata tills F3 och F11)
      { path: 'overview', element: only(staff, <Overview />) },
      { path: 'reports/:reportId', element: only(staff, <WeeklyReport />) },
      { path: 'student-history', element: only(staff, <StudentHistory />) },
      placeholder('reports', staff, 'Veckoredovisningar', 'Alla veckoredovisningar, med filter per klass, elev och vecka.'),
      placeholder('projects', staff, 'Projekt', 'Projekt som tilldelas elever och kopplas till veckoredovisningar.'),

      // Klasser och elever (B2/F3)
      { path: 'classes', element: only(['school_admin', 'principal'], <ClassList />) },
      { path: 'classes/new', element: only(['teacher', 'school_admin'], <NewClass />) },
      { path: 'classes/:classId', element: only(['teacher', 'school_admin', 'principal', 'superadmin'], <ClassPage />) },
      { path: 'students', element: only(['school_admin', 'principal', 'syv'], <StudentList />) },
      { path: 'students/:studentId', element: only(['teacher', 'school_admin', 'principal', 'syv', 'superadmin'], <StudentPage />) },

      // Flera roller
      placeholder('messages', ['teacher', 'student', 'supervisor', 'syv'], 'Meddelanden', 'Meddelanden mellan lärare, elever och handledare.'),
      placeholder('placements', ['teacher', 'student', 'school_admin'], 'Praktikplatser', 'Arbetsplatser, handledare och vilka elever som är där.'),
      placeholder('contracts', ['teacher', 'supervisor', 'school_admin'], 'Kontrakt', 'Utbildningskontrakt och APL-avtal att signera.'),
      placeholder('settings', anyRole, 'Inställningar', 'Konto och aviseringar.'),

      // Elev (F4, F5, F10)
      placeholder('my-apl', ['student'], 'Min APL', 'Din arbetsplats, period och handledare. Kommer i F4.'),
      placeholder('check-in', ['student'], 'Incheckning', 'Checka in för dagens APL. Kommer i F5.'),

      // Handledare (F4)
      placeholder('my-students', ['supervisor'], 'Mina elever', 'Eleverna du handleder just nu. Kommer i F4.'),

      // Skolans ledning och administration
      placeholder('users', ['school_admin', 'principal'], 'Användare', 'Skolans personal och elever. Kommer i F7.'),
      placeholder('school', ['principal'], 'Översikt', 'Skolans APL i siffror: elever på APL, närvaro och avtal.'),
      placeholder('admin-reports', ['school_admin', 'principal'], 'Rapporter', 'Statsbidragsrapport och underlag för materialersättning. Kommer i F7.'),

      // Superadmin
      placeholder('admin/schools', ['superadmin'], 'Skolor', 'Alla skolor i Firstflow och deras administratörer.'),

      { path: '*', element: <Placeholder title="Sidan finns inte" description="Kontrollera adressen eller gå tillbaka till startsidan." /> },
    ],
  },
]

// Demobygget publiceras som en statisk sida och använder därför #-adresser.
const router = import.meta.env.VITE_HASH_ROUTER === '1' ? createHashRouter(routes) : createBrowserRouter(routes)

export default function App() {
  return <RouterProvider router={router} />
}
