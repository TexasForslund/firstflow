import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type Workplace = components['schemas']['WorkplaceRead']
export type Placement = components['schemas']['PlacementRead']
export type PlacementCreate = components['schemas']['PlacementCreate']
export type MyPlacement = components['schemas']['MyPlacement']
export type SupervisedStudent = components['schemas']['SupervisedStudent']

const keys = {
  workplaces: ['workplaces'] as const,
  classPlacements: (classId: string) => ['classes', classId, 'placements'] as const,
  mine: ['me', 'placements'] as const,
  supervised: ['supervisor', 'students'] as const,
}

/** Skolans arbetsplatser med handledare. */
export function useWorkplaces(enabled = true) {
  return useQuery({
    queryKey: keys.workplaces,
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/workplaces')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useCreateWorkplace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; address: string | null }) => {
      const { data, error, response } = await api.POST('/api/workplaces', {
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.workplaces }),
  })
}

/** Skapar ett handledarkonto på arbetsplatsen, eller kopplar en befintlig handledare med samma e-post. */
export function useAddSupervisor(workplaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; email: string }) => {
      const { data, error, response } = await api.POST('/api/workplaces/{workplace_id}/supervisors', {
        params: { path: { workplace_id: workplaceId } },
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.workplaces }),
  })
}

/** Klassens placeringar. Klassvyns elevrad tar elevens pågående placering härifrån. */
export function useClassPlacements(classId: string, enabled = true) {
  return useQuery({
    queryKey: keys.classPlacements(classId),
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/classes/{class_id}/placements', {
        params: { path: { class_id: classId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Invaliderar alla listor som visar placeringar. */
function useInvalidatePlacements() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: keys.supervised })
    queryClient.invalidateQueries({ queryKey: keys.mine })
    return queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'classes' && q.queryKey[2] === 'placements',
    })
  }
}

export function useCreatePlacement() {
  const invalidate = useInvalidatePlacements()
  return useMutation({
    mutationFn: async (body: PlacementCreate) => {
      const { data, error, response } = await api.POST('/api/placements', {
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDeletePlacement() {
  const invalidate = useInvalidatePlacements()
  return useMutation({
    mutationFn: async (placementId: string) => {
      const { error, response } = await api.DELETE('/api/placements/{placement_id}', {
        params: { path: { placement_id: placementId } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: invalidate,
  })
}

/** Elevens egna placeringar, i datumordning. */
export function useMyPlacements() {
  return useQuery({
    queryKey: keys.mine,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/me/placements')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Elever som handledaren har i dag. */
export function useSupervisedStudents() {
  return useQuery({
    queryKey: keys.supervised,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/supervisor/students')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}
