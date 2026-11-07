import type { components } from '../../api/schema'

export type AbsenceReason = components['schemas']['AbsenceReason']

/** Förklaringarna handledaren kan välja (Texas skiss "Frånvaro med förklaring", 2026-11-07). */
export const absenceLabel: Record<AbsenceReason, string> = {
  sick: 'Sjuk',
  leave: 'Ledig',
  other: 'Annat',
}
