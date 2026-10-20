import styles from './Switch.module.css'

/** Av/på-reglage. En kryssruta med role="switch", så att skärmläsare säger "på" och "av". */
export function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={styles.row}>
      <span className={styles.text}>
        <span>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
