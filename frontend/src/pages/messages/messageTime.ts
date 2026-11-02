const DAY = 24 * 60 * 60 * 1000

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** I listan: "10:42", "I går", "tis" eller "12 okt". */
export function listTime(iso: string | null | undefined) {
  if (!iso) return ''
  const date = new Date(iso)
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY)
  if (days === 0) return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'I går'
  if (days < 7) return date.toLocaleDateString('sv-SE', { weekday: 'short' })
  return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

/** Klockslag vid ett meddelande. */
export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

/** Rubrik för en dag i samtalet: "I dag", "I går" eller "måndag 12 oktober". */
export function dayLabel(iso: string) {
  const date = new Date(iso)
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY)
  if (days === 0) return 'I dag'
  if (days === 1) return 'I går'
  return date.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function sameDay(a: string, b: string) {
  return startOfDay(new Date(a)) === startOfDay(new Date(b))
}

export function sizeText(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
