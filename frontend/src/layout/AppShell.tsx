import {
  ChevronDown,
  GraduationCap,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
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
  /** Färgen på siffran. Standard är lila. */
  tone?: 'primary' | 'attention' | 'butter'
  /** Kort text till höger när det inte finns någon siffra, t.ex. "3/5". */
  meta?: string
  /** Rubrik som valet hör till i menyn, t.ex. "I dag". Utan rubrik visas valen utan grupper. */
  group?: string
  /** Visa lärarens klasser direkt under det här valet. */
  classesAfter?: boolean
}

export interface SidebarClass {
  id: string
  name: string
  count: number
}

interface AppShellProps {
  userName: string
  /** Rad under namnet längst ned i menyn, t.ex. "Lärare · Kramforsskolan". */
  userSubtitle?: string
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

export function AppShell({ userName, userSubtitle, nav, classes, onLogout, tabBar, top }: AppShellProps) {
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

  // Valen i den ordning de kommer, grupperade på rubrik.
  const groups: { name?: string; items: NavItem[] }[] = []
  for (const item of nav) {
    const last = groups[groups.length - 1]
    if (last && last.name === item.group) last.items.push(item)
    else groups.push({ name: item.group, items: [item] })
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
            <Logo height={26} symbolOnly={collapsed} />
          </Link>
          <span className={styles.topActions}>
            <NotificationBell />
          </span>
        </div>

        <nav aria-label="Huvudmeny" className={styles.nav}>
          {groups.map((group) => (
            <div key={group.name ?? 'main'} className={styles.group}>
              {group.name && <h2 className={styles.groupLabel}>{group.name}</h2>}
              <ul>
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                    >
                      <item.icon aria-hidden="true" className={styles.navIcon} />
                      <span className={styles.navLabel}>{item.label}</span>
                      {item.count ? (
                        <span className={styles.navCount}>
                          <CountBadge count={item.count} label={item.countLabel} tone={item.tone} />
                        </span>
                      ) : item.meta ? (
                        <span className={styles.navMeta}>{item.meta}</span>
                      ) : null}
                    </NavLink>
                    {item.classesAfter && classes && <ClassList classes={classes} />}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <AccountMenu
          userName={userName}
          subtitle={userSubtitle}
          collapsed={collapsed}
          onLogout={onLogout}
          onToggleCollapsed={toggleCollapsed}
        />
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

const CLASSES_OPEN_KEY = 'firstflow-sidebar-classes-open'

/** Lärarens klasser under Elevhistorik. Går att fälla ihop, valet sparas i webbläsaren. */
function ClassList({ classes }: { classes: SidebarClass[] }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(CLASSES_OPEN_KEY) !== '0'
    } catch {
      return true
    }
  })

  function toggle() {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(CLASSES_OPEN_KEY, next ? '1' : '0')
    } catch {
      // Utan lagring gäller valet bara tills sidan laddas om.
    }
  }

  return (
    <div className={styles.classes}>
      <button
        type="button"
        className={styles.navItem}
        aria-expanded={open}
        aria-controls="sidebar-classes"
        onClick={toggle}
      >
        <GraduationCap aria-hidden="true" className={styles.navIcon} />
        <span className={styles.navLabel}>Mina klasser</span>
        <ChevronDown aria-hidden="true" className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
      </button>
      {open && (
        <ul id="sidebar-classes" className={styles.classList}>
          {classes.length === 0 && <li className={styles.noClasses}>Du har inga klasser än.</li>}
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
          <li>
            <Link to="/classes/new" className={styles.createClass}>
              <Plus aria-hidden="true" />
              Ny klass
            </Link>
          </li>
        </ul>
      )}
    </div>
  )
}

/** Kontot längst ned: namnet öppnar Inställningar och Logga ut. Bredvid fälls menyn ihop. */
function AccountMenu({
  userName,
  subtitle,
  collapsed,
  onLogout,
  onToggleCollapsed,
}: {
  userName: string
  subtitle?: string
  collapsed: boolean
  onLogout: () => void
  onToggleCollapsed: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Stäng när användaren klickar utanför eller trycker Escape.
  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.account} ref={ref}>
      {open && (
        <ul id="account-menu" className={styles.accountMenu}>
          <li>
            <Link to="/settings" className={styles.accountItem} onClick={() => setOpen(false)}>
              <Settings aria-hidden="true" />
              Inställningar
            </Link>
          </li>
          <li>
            <button type="button" className={styles.accountItem} onClick={onLogout}>
              <LogOut aria-hidden="true" />
              Logga ut
            </button>
          </li>
        </ul>
      )}
      <button
        type="button"
        className={styles.accountButton}
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={collapsed ? `Konto: ${userName}` : undefined}
        title={collapsed ? userName : undefined}
        onClick={() => setOpen(!open)}
      >
        <Avatar name={userName} size="sm" color="pink" />
        <span className={styles.accountText}>
          <span className={styles.accountName}>{userName}</span>
          {subtitle && <span className={styles.accountSubtitle}>{subtitle}</span>}
        </span>
      </button>
      <button
        type="button"
        className={styles.collapseButton}
        aria-label={collapsed ? 'Visa hela menyn' : 'Fäll ihop menyn'}
        title={collapsed ? 'Visa hela menyn' : 'Fäll ihop menyn'}
        aria-expanded={!collapsed}
        aria-controls="sidebar"
        onClick={onToggleCollapsed}
      >
        {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
      </button>
    </div>
  )
}

