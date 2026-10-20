import styles from '../classes/Classes.module.css'

interface CheckListProps {
  legend: string
  options: { id: string; name: string }[]
  selected: string[]
  onChange: (selected: string[]) => void
  emptyText: string
}

/** Kryssrutor i en ram, t.ex. för att välja elevens lärare. */
export function CheckList({ legend, options, selected, onChange, emptyText }: CheckListProps) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      {options.length === 0 ? (
        <p className={styles.hint}>{emptyText}</p>
      ) : (
        <div className={styles.checks}>
          {options.map((option) => (
            <label key={option.id} className={styles.check}>
              <input type="checkbox" checked={selected.includes(option.id)} onChange={() => toggle(option.id)} />
              {option.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}
