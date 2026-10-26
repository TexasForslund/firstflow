import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Settings, X, type LucideIcon } from 'lucide-react'
import { useState, type MouseEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router'

import { Avatar, CountBadge, Logo } from '../components'
import styles from './AppShell.module.css'
import { NotificationBell } from './NotificationBell'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  count?: number
  countLabel?: string
}

export interface SidebarClass {
  id: string
  name: string
  count: number
}

interface AppShellProps {
  userName: string
  nav: NavItem[]
  /** Lärarens klasser i sidomenyn. Utelämna för roller utan egna klasser. */
  classes?: SidebarClass[]
  onLogout: () => void
  /** Flikrad längst ned i mobilen, som i appar. Används i elevens vy. */
  tabBar?: boolean
  /** Innehåll överst i huvudytan på alla sidor, t.ex. elevens incheckning. */
  top?: ReactNode
}

const COLLAPSED_KEY = 'firstflow-sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell({ userName, nav, classes, onLogout, tabBar, top }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  // Fälls ihop på stor skärm så att bara ikonerna syns. Valet sparas i webbläsaren.
  const [collapsed, setCollapsed] = useState(readCollapsed)

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      // Utan lagring gäller valet bara tills sidan laddas om.
    }
  }

  // Stäng mobilmenyn när användaren klickar på en länk i den.
  function closeOnLink(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('a')) setMenuOpen(false)
  }

  return (
    <div className={`${styles.shell} ${tabBar ? styles.withTabBar : ''} ${collapsed ? styles.collapsed : ''}`}>
      <header className={styles.mobileBar}>
        <Link to="/" aria-label="Firstflow, till startsidan">
          <Logo height={28} />
        </Link>
        <span className={styles.mobileActions}>
          <NotificationBell />
          <button
            type="button"
            className={styles.menuButton}
          aria-label={menuOpen ? 'Stäng menyn' : 'Öppna menyn'}
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen(!menuOpen)}
        >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </span>
      </header>

      {menuOpen && <div className={styles.backdrop} onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <aside id="sidebar" className={`${styles.sidebar} ${menuOpen ? styles.open : ''}`} onClick={closeOnLink}>
        <div className={styles.sidebarTop}>
          <Link to="/" className={styles.logo} aria-label="Firstflow, till startsidan">
            <Logo height={30} symbolOnly={collapsed} />
          </Link>
          <span className={styles.topActions}>
            <NotificationBell />
            <button
              type="button"
              className={styles.collapseButton}
            aria-label={collapsed ? 'Visa hela menyn' : 'Fäll ihop menyn'}
            title={collapsed ? 'Visa hela menyn' : 'Fäll ihop menyn'}
            aria-expanded={!collapsed}
            aria-controls="sidebar"
            onClick={toggleCollapsed}
          >
              {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            </button>
          </span>
        </div>

        <div className={styles.user} title={collapsed ? userName : undefined}>
          <Avatar name={userName} size="sm" color="pink" />
          <div>
            <p className={styles.welcome}>Välkommen tillbaka</p>
            <p className={styles.userName}>{userName}</p>
          </div>
        </div>

        <nav aria-label="Huvudmeny" className={styles.nav}>
          <ul>
            {nav.map(({ to, label, icon: Icon, count, countLabel }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                >
                  <Icon aria-hidden="true" className={styles.navIcon} />
                  <span className={styles.navLabel}>{label}</span>
                  {count ? (
                    <span className={styles.navCount}>
                      <CountBadge count={count} label={countLabel} />
                    </span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {classes && (
          <section className={`${styles.section} ${styles.classesSection}`} aria-labelledby="your-classes">
            <h2 id="your-classes" className={styles.sectionLabel}>
              Dina klasser
            </h2>
            {classes.length === 0 && <p className={styles.noClasses}>Du har inga klasser än.</p>}
            <ul>
              {classes.map((cls) => (
                <li key={cls.id}>
                  <NavLink
                    to={`/classes/${cls.id}`}
                    className={({ isActive }) => `${styles.classItem} ${isActive ? styles.active : ''}`}
                  >
                    <span>{cls.name}</span>
                    <span className={styles.classCount} aria-label={`${cls.count} elever`}>
                      {cls.count}
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>
            <Link to="/classes/new" className={styles.createClass}>
              <Plus aria-hidden="true" />
              Skapa klass
            </Link>
          </section>
        )}

        <section className={styles.section} aria-labelledby="account">
          <h2 id="account" className={styles.sectionLabel}>
            Konto
          </h2>
          <ul>
            <li>
              <NavLink
                to="/settings"
                title={collapsed ? 'Inställningar' : undefined}
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              >
                <Settings aria-hidden="true" className={styles.navIcon} />
                <span className={styles.navLabel}>Inställningar</span>
              </NavLink>
            </li>
            <li>
              <button
                type="button"
                className={styles.navItem}
                onClick={onLogout}
                title={collapsed ? 'Logga ut' : undefined}
              >
                <LogOut aria-hidden="true" className={styles.navIcon} />
                <span className={styles.navLabel}>Logga ut</span>
              </button>
            </li>
          </ul>
        </section>
      </aside>

      <main className={styles.main}>
        {top}
        <Outlet />
      </main>

      {tabBar && (
        <nav aria-label="Flikar" className={styles.tabBar}>
          <ul>
            {nav.map(({ to, label, icon: Icon, count }) => (
              <li key={to}>
                <NavLink to={to} className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                  {count ? <span className={styles.tabDot} aria-hidden="true" /> : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
