import { createBrowserRouter, RouterProvider, Navigate } from 'react-router'
import { AppShell } from './components'
import { PlaceholderPage } from './pages/PlaceholderPage'

// Hårdkodad demolärare tills F2 (inloggning) är klar
// Byt role för att testa olika navrullor:
// 'teacher' | 'student' | 'supervisor' | 'school_admin' | 'principal' | 'syv' | 'superadmin'
const DEMO_USER = { name: 'Demo Lärare', role: 'teacher' as const }

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AppShell
        role={DEMO_USER.role}
        userName={DEMO_USER.name}
        onLogout={() => alert('Utloggning implementeras i F2')}
      />
    ),
    children: [
      { index: true, element: <Navigate to="/classes" replace /> },
      {
        path: 'classes',
        element: <PlaceholderPage title="Klasser" description="Dina klasser och elever visas här" />,
      },
      {
        path: 'attendance',
        element: <PlaceholderPage title="Närvaro" description="Närvaro per klass och period" />,
      },
      {
        path: 'my-apl',
        element: <PlaceholderPage title="Min APL" description="Din arbetsplats, period och handledare" />,
      },
      {
        path: 'check-in',
        element: <PlaceholderPage title="Incheckning" description="Checka in för dagens APL" />,
      },
      {
        path: 'my-students',
        element: <PlaceholderPage title="Mina elever" description="Elever du handleder just nu" />,
      },
      {
        path: 'school',
        element: <PlaceholderPage title="Skolan" description="Skolans inställningar och översikt" />,
      },
      {
        path: 'users',
        element: <PlaceholderPage title="Användare" description="Hantera lärare och personal" />,
      },
      {
        path: 'students',
        element: <PlaceholderPage title="Elever" description="Elevöversikt för SYV" />,
      },
      {
        path: 'admin/schools',
        element: <PlaceholderPage title="Skolor" description="Alla skolor i systemet" />,
      },
    ],
  },
  {
    path: '/login',
    element: <PlaceholderPage title="Logga in" description="Inloggning implementeras i F2" />,
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
