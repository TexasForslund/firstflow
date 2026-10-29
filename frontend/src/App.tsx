import type { ReactNode } from 'react'
import { createBrowserRouter, createHashRouter, RouterProvider, type RouteObject } from 'react-router'

import { RequireAuth, RoleHome, RoleRoute } from './auth/RequireAuth'
import type { Role } from './auth/roles'
import { SchoolPage } from './pages/admin/SchoolPage'
import { Schools } from './pages/admin/Schools'
import { Users } from './pages/admin/Users'
import { AcceptInvite } from './pages/auth/AcceptInvite'
import { Login } from './pages/auth/Login'
import { ClassList } from './pages/classes/ClassList'
import { ClassPage } from './pages/classes/ClassPage'
import { NewClass } from './pages/classes/NewClass'
import { StudentList } from './pages/students/StudentList'
import { StudentPage } from './pages/students/StudentPage'
import { Placeholder } from './pages/Placeholder'
import { Placements } from './pages/placements/Placements'
import { Settings } from './pages/settings/Settings'
import { AnswerReport } from './pages/student/AnswerReport'
import { CheckIn } from './pages/student/CheckIn'
import { MyApl } from './pages/student/MyApl'
import { MyReports } from './pages/student/MyReports'
import { ReportPost } from './pages/student/ReportPost'
import { Company } from './pages/supervisor/Company'
import { MyStudents } from './pages/supervisor/MyStudents'
import { Attendance } from './pages/teacher/Attendance'
import { Overview } from './pages/teacher/Overview'
import { ProjectPage } from './pages/projects/ProjectPage'
import { Projects } from './pages/projects/Projects'
import { StudentHistory } from './pages/teacher/StudentHistory'
import { ReportRoute } from './pages/teacher/TeacherReport'

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
  // Länken i inbjudningsmejlet. Kräver ingen inloggning.
  { path: '/invite/:token', element: <AcceptInvite /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      { index: true, element: <RoleHome /> },

      // Lärare (demodata tills F3 och F11)
      { path: 'overview', element: only(staff, <Overview />) },
      { path: 'reports/:reportId', element: only(staff, <ReportRoute />) },
      { path: 'student-history', element: only(staff, <StudentHistory />) },
      { path: 'attendance', element: only(['teacher', 'school_admin', 'principal'], <Attendance />) },
      placeholder('reports', staff, 'Veckoredovisningar', 'Alla veckoredovisningar, med filter per klass, elev och vecka.'),
      { path: 'projects', element: only(['teacher', 'supervisor'], <Projects />) },
      { path: 'projects/:projectId', element: only(['teacher', 'supervisor'], <ProjectPage />) },

      // Klasser och elever (B2/F3)
      { path: 'classes', element: only(['school_admin', 'principal'], <ClassList />) },
      { path: 'classes/new', element: only(['teacher', 'school_admin'], <NewClass />) },
      { path: 'classes/:classId', element: only(['teacher', 'school_admin', 'principal', 'superadmin'], <ClassPage />) },
      { path: 'students', element: only(['school_admin', 'principal', 'syv'], <StudentList />) },
      { path: 'students/:studentId', element: only(['teacher', 'school_admin', 'principal', 'syv', 'superadmin'], <StudentPage />) },

      // Flera roller
      placeholder('messages', ['teacher', 'student', 'supervisor', 'syv'], 'Meddelanden', 'Meddelanden mellan lärare, elever och handledare.'),
      { path: 'placements', element: only(['teacher', 'school_admin', 'principal'], <Placements />) },
      placeholder('contracts', ['teacher', 'supervisor', 'school_admin'], 'Kontrakt', 'Utbildningskontrakt och APL-avtal att signera.'),
      { path: 'settings', element: only(anyRole, <Settings />) },

      // Elev (F4, F5, F10, F13)
      { path: 'my-reports', element: only(['student'], <MyReports />) },
      { path: 'my-reports/:reportId', element: only(['student'], <ReportPost />) },
      { path: 'my-reports/:reportId/answer', element: only(['student'], <AnswerReport />) },
      { path: 'my-apl', element: only(['student'], <MyApl />) },
      { path: 'check-in', element: only(['student'], <CheckIn />) },

      // Handledare (F4)
      { path: 'my-students', element: only(['supervisor'], <MyStudents />) },
      { path: 'company', element: only(['supervisor'], <Company />) },

      // Skolans ledning och administration
      { path: 'users', element: only(['school_admin', 'principal'], <Users />) },
      placeholder('school', ['principal'], 'Översikt', 'Skolans APL i siffror: elever på APL, närvaro och avtal.'),
      placeholder('admin-reports', ['school_admin', 'principal'], 'Rapporter', 'Statsbidragsrapport och underlag för materialersättning. Kommer i F7.'),

      // Superadmin
      { path: 'admin/schools', element: only(['superadmin'], <Schools />) },
      { path: 'admin/schools/:schoolId', element: only(['superadmin'], <SchoolPage />) },

      { path: '*', element: <Placeholder title="Sidan finns inte" description="Kontrollera adressen eller gå tillbaka till startsidan." /> },
    ],
  },
]

// Demobygget publiceras som en statisk sida och använder därför #-adresser.
const router = import.meta.env.VITE_HASH_ROUTER === '1' ? createHashRouter(routes) : createBrowserRouter(routes)

export default function App() {
  return <RouterProvider router={router} />
}
