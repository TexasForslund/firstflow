/**
 * Firstflow-logotypen. Symbolen är en tillfällig återgivning av skissen.
 * Byt mot originalfilen (SVG) när den finns.
 */
export function Logo({ height = 40 }: { height?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: height * 0.22 }}>
      <svg width={height * 0.9} height={height} viewBox="0 0 36 40" aria-hidden="true">
        <path d="M14 2 L32 10 L32 30 L24 38 L24 18 L8 11 Z" fill="#7353ff" />
        <path d="M2 21 L14 15 L20 18 L20 26 L12 30 L2 26 Z" fill="#9b85ff" />
        <path d="M2 21 L12 26 L12 30 L2 26 Z" fill="#7353ff" />
      </svg>
      <span
        style={{
          fontSize: height * 0.98,
          fontWeight: 700,
          letterSpacing: '-0.035em',
          lineHeight: 1,
          color: 'var(--color-text)',
        }}
      >
        Firstflow
      </span>
    </span>
  )
}
