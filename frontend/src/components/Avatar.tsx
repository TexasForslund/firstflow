import styles from './Avatar.module.css'

const palette = ['yellow', 'blue', 'purple', 'green', 'pink'] as const

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

// Samma namn ger alltid samma färg.
function colorFor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]
}

interface AvatarProps {
  name: string
  imageUrl?: string
  size?: 'sm' | 'md' | 'lg'
  /** Tvinga en färg, t.ex. för att matcha en skiss. */
  color?: (typeof palette)[number]
}

export function Avatar({ name, imageUrl, size = 'md', color }: AvatarProps) {
  const className = `${styles.avatar} ${styles[size]}`
  if (imageUrl) {
    return <img className={className} src={imageUrl} alt="" />
  }
  return (
    <span className={`${className} ${styles[color ?? colorFor(name)]}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
