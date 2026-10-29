import { useQuery } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type TeacherOverview = components['schemas']['TeacherOverview']
export type AttentionItem = components['schemas']['AttentionItem']
export type OverviewReport = components['schemas']['OverviewReport']

export const overviewKey = ['teacher', 'overview'] as const

/** Lärarens översikt. Hämtas om varannan minut så att dagens incheckningar syns. */
export function useTeacherOverview(enabled = true) {
  return useQuery({
    queryKey: overviewKey,
    enabled,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/teacher/overview')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

const waitingName = { student: 'eleven', supervisor: 'handledaren', teacher: 'läraren' } as const

/** Vem ett kontrakt väntar på: "eleven", "handledaren" eller "eleven och handledaren". */
export function waitingText(item: { waiting_for?: ('student' | 'supervisor' | 'teacher')[] }) {
  return (item.waiting_for ?? []).map((role) => waitingName[role]).join(' och ') || 'signering'
}
