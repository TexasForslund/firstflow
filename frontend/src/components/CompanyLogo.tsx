import styles from './CompanyLogo.module.css'

/**
 * Företagets logga, eller första bokstaven i namnet om det inte finns någon (Texas, 2026-11-02).
 * Namnet står alltid bredvid, så bilden är dekoration för skärmläsare.
 */
export function CompanyLogo({
  name,
  logoUrl,
  size = 'md',
}: {
  name: string
  logoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <span className={`${styles.logo} ${styles[size]}`} aria-hidden="true">
      {logoUrl ? <img src={logoUrl} alt="" /> : name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
