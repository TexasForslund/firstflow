import { roleLabel, type Signer } from '../../api/contracts'
import styles from './Contracts.module.css'

const letter = { student: 'E', teacher: 'L', supervisor: 'H' } as const

/** En rund markering per part: grön när parten har signerat, streckad när den väntar. */
export function SignerDots({ signers }: { signers: Signer[] }) {
  const text = signers
    .map((s) => `${roleLabel[s.role]} ${s.person.name}: ${s.signed_at ? 'signerat' : 'väntar'}`)
    .join(', ')
  return (
    <span className={styles.dots}>
      <span className="sr-only">{text}</span>
      {signers.map((s) => (
        <span key={s.role} className={styles.dot} data-signed={s.signed_at ? '' : undefined} aria-hidden="true">
          {letter[s.role]}
        </span>
      ))}
    </span>
  )
}
