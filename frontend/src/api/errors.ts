/** Felmeddelandet från API:t (fältet detail), eller en allmän text. */
export function apiErrorMessage(error: unknown, fallback = 'Något gick fel. Försök igen.'): string {
  if (error && typeof error === 'object' && 'detail' in error) {
    const detail = (error as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return 'Kontrollera uppgifterna och försök igen.'
  }
  return fallback
}

/** Kastas av mutationer så att komponenten kan visa API:ts felmeddelande. */
export class ApiError extends Error {
  readonly body: unknown
  readonly status: number

  constructor(body: unknown, status: number) {
    super(apiErrorMessage(body))
    this.body = body
    this.status = status
  }
}
