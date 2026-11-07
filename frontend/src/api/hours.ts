import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type HoursDay = components['schemas']['Day']
export type CompanyHours = components['schemas']['CompanyHours']
export type PlacementHours = components['schemas']['PlacementHoursRead']

const keys = {
  company: (id: string) => ['hours', 'company', id] as const,
  placement: (id: string) => ['hours', 'placement', id] as const,
}

/** Företagets arbetstider och handledarens elever där (idé 12, Texas 2026-11-07). */
export function useCompanyHours(workplaceId: string) {
  return useQuery({
    queryKey: keys.company(workplaceId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/supervisor/workplaces/{workplace_id}/hours', {
        params: { path: { workplace_id: workplaceId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useSaveCompanyHours(workplaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (days: HoursDay[]) => {
      const { data, error, response } = await api.PUT('/api/supervisor/workplaces/{workplace_id}/hours', {
        params: { path: { workplace_id: workplaceId } },
        body: { days },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hours'] }),
  })
}

/** Tiderna som gäller för eleven på praktikplatsen. */
export function usePlacementHours(placementId: string | null | undefined) {
  return useQuery({
    queryKey: keys.placement(placementId ?? ''),
    enabled: !!placementId,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/placements/{placement_id}/hours', {
        params: { path: { placement_id: placementId ?? '' } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Egna tider för eleven. `null` gör att eleven följer företagets tider igen. */
export function useSaveOwnHours(placementId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (days: HoursDay[] | null) => {
      const { data, error, response } = await api.PUT('/api/supervisor/placements/{placement_id}/hours', {
        params: { path: { placement_id: placementId } },
        body: { days },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hours'] }),
  })
}

const SHORT = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön']

export function hhmm(value: string) {
  return value.slice(0, 5)
}

/** "Mån–tors 07:00–16:00 · fre 07:00–12:00", eller tom sträng utan tider. */
export function hoursSummary(days: HoursDay[]) {
  const sorted = [...days].sort((a, b) => a.weekday - b.weekday)
  const groups: { from: number; to: number; time: string }[] = []
  for (const d of sorted) {
    const time = `${hhmm(d.start)}–${hhmm(d.end)}`
    const last = groups.at(-1)
    if (last && last.time === time && last.to === d.weekday - 1) last.to = d.weekday
    else groups.push({ from: d.weekday, to: d.weekday, time })
  }
  const text = groups
    .map((g) => `${g.from === g.to ? SHORT[g.from] : `${SHORT[g.from]}–${SHORT[g.to]}`} ${g.time}`)
    .join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Om alla dagar slutar efter att de börjar. */
export function hoursValid(days: HoursDay[]) {
  return days.every((d) => d.start && d.end && hhmm(d.end) > hhmm(d.start))
}
