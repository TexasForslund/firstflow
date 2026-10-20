import { LogOut, Menu, Plus, Settings, X, type LucideIcon } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { Link, NavLink, Outlet } from 'react-router'

import { Avatar, CountBadge, Logo } from '../components'
import styles from './AppShell.module.css'

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
  classes?: SidebarClass[]
  onLogout: () => void
}

export function AppShell({ userName, nav, classes, onLogout }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  // Stäng mobilmenyn när användaren klickar på en länk i den.
  function closeOnLink(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('a')) setMenuOpen(false)
  }

  return (
    <div className={styles.shell}>
      <header className={styles.mobileBar}>
        <Link to="/" aria-label="Firstflow, till startsidan">
          <Logo height={28} />
        </Link>
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
      </header>

      {menuOpen && <div className={styles.backdrop} onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <aside id="sidebar" className={`${styles.sidebar} ${menuOpen ? styles.open : ''}`} onClick={closeOnLink}>
        <Link to="/" className={styles.logo} aria-label="Firstflow, till startsidan">
          <Logo height={40} />
        </Link>

        <div className={styles.user}>
          <Avatar name={userName} size="lg" color="pink" />
          <div>
            <p className={styles.welcome}>Välkommen tillbaka</p>
            <p className={styles.userName}>{userName}</p>
          </div>
        </div>

        <nav aria-label="Huvudmeny" className={styles.nav}>
          <ul>
            {nav.map(({ to, label, icon: Icon, count, countLabel }) => (
              <li key={to}>
                <NavLink to={to} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
                  <Icon aria-hidden="true" className={styles.navIcon} />
                  <span className={styles.navLabel}>{label}</span>
                  {count ? <CountBadge count={count} label={countLabel} /> : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {classes && (
          <section className={styles.section} aria-labelledby="your-classes">
            <h2 id="your-classes" className={styles.sectionLabel}>
              Dina klasser
            </h2>
            <ul>
              {classes.map((cls) => (
                <li key={cls.id}>
                  <Link to={`/student-history?class=${cls.id}`} className={styles.classItem}>
                    <span>{cls.name}</span>
                    <span className={styles.classCount} aria-label={`${cls.count} elever`}>
                      {cls.count}
                    </span>
                  </Link>
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
              <NavLink to="/settings" className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
                <Settings aria-hidden="true" className={styles.navIcon} />
                <span className={styles.navLabel}>Inställningar</span>
              </NavLink>
            </li>
            <li>
              <button type="button" className={styles.navItem} onClick={onLogout}>
                <LogOut aria-hidden="true" className={styles.navIcon} />
                <span className={styles.navLabel}>Logga ut</span>
              </button>
            </li>
          </ul>
        </section>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
