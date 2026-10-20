import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'

import styles from './Buttons.module.css'

type Variant = 'pill' | 'soft' | 'primary'

interface CommonProps {
  variant?: Variant
  icon?: ReactNode
  children: ReactNode
}

/** Knapp. "pill" = vit med kant ("Se alla ↗"), "soft" = ljuslila ("Öppna ↗"), "primary" = lila. */
export function Button({
  variant = 'pill',
  icon,
  children,
  className,
  type = 'button',
  ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={`${styles.button} ${styles[variant]} ${className ?? ''}`} {...props}>
      {children}
      {icon}
    </button>
  )
}

/** Samma utseende som Button men navigerar. */
export function ButtonLink({ variant = 'pill', icon, children, className, ...props }: CommonProps & LinkProps) {
  return (
    <Link className={`${styles.button} ${styles[variant]} ${className ?? ''}`} {...props}>
      {children}
      {icon}
    </Link>
  )
}
