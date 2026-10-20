import { NavLink, Outlet } from 'react-router'

type Role = 'teacher' | 'student' | 'supervisor' | 'school_admin' | 'principal' | 'syv' | 'superadmin'

interface NavItem {
  to: string
  label: string
  icon: string
}

const navByRole: Record<Role, NavItem[]> = {
  teacher: [
    { to: '/classes', label: 'Klasser', icon: '📚' },
    { to: '/attendance', label: 'Närvaro', icon: '✅' },
  ],
  student: [
    { to: '/my-apl', label: 'Min APL', icon: '🏭' },
    { to: '/check-in', label: 'Incheckning', icon: '📍' },
  ],
  supervisor: [
    { to: '/my-students', label: 'Mina elever', icon: '👥' },
  ],
  school_admin: [
    { to: '/school', label: 'Skolan', icon: '🏫' },
    { to: '/users', label: 'Användare', icon: '👤' },
  ],
  principal: [
    { to: '/school', label: 'Skolan', icon: '🏫' },
    { to: '/classes', label: 'Klasser', icon: '📚' },
  ],
  syv: [
    { to: '/students', label: 'Elever', icon: '👥' },
  ],
  superadmin: [
    { to: '/admin/schools', label: 'Skolor', icon: '🏫' },
  ],
}

interface AppShellProps {
  role: Role
  userName: string
  onLogout: () => void
}

export function AppShell({ role, userName, onLogout }: AppShellProps) {
  const navItems = navByRole[role] ?? []

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        background: 'var(--color-bg)',
      }}
    >
      {/* Topbar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          height: 'var(--nav-height)',
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-4)',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', letterSpacing: '-0.01em' }}>
          Firstflow
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            {userName}
          </span>
          <button
            onClick={onLogout}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            Logga ut
          </button>
        </div>
      </header>

      {/* Sidinnehåll */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-5) var(--space-4)',
          paddingBottom: navItems.length > 0
            ? 'calc(var(--bottom-nav-height) + var(--space-5))'
            : 'var(--space-5)',
          maxWidth: 'var(--app-max-width)',
          width: '100%',
          margin: '0 auto',
        }}
      >
        <Outlet />
      </main>

      {/* Mobilnavigering */}
      {navItems.length > 0 && (
        <nav
          aria-label="Navigering"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 'var(--bottom-nav-height)',
            background: 'var(--color-bg)',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            zIndex: 10,
          }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-1)',
                textDecoration: 'none',
                fontSize: 'var(--font-size-xs)',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                background: isActive ? 'var(--color-primary-light)' : 'transparent',
                borderTop: isActive ? `2px solid var(--color-primary)` : '2px solid transparent',
                transition: 'color 0.15s, background 0.15s',
                minHeight: '44px',
              })}
            >
              <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
