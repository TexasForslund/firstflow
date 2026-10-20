import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type School = components['schemas']['SchoolRead']
export type SchoolUser = components['schemas']['UserRead']
export type StaffRole = 'principal' | 'syv' | 'teacher'

/** En skolas alla konton. Skoladmin och rektor för sin skola, superadmin för alla. */
export function useSchoolUsers(schoolId: string | null | undefined) {
  return useQuery({
    queryKey: ['schools', schoolId, 'users'],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/schools/{school_id}/users', {
        params: { path: { school_id: schoolId! } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useCreateStaff(schoolId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; email: string; role: StaffRole }) => {
      const { data, error, response } = await api.POST('/api/schools/{school_id}/users', {
        params: { path: { school_id: schoolId } },
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schools', schoolId] }),
  })
}

export function useSchools() {
  return useQuery({
    queryKey: ['schools'],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/superadmin/schools')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useCreateSchool() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; org_number: string | null }) => {
      const { data, error, response } = await api.POST('/api/superadmin/schools', { body })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schools'], exact: true }),
  })
}

export function useCreateSchoolAdmin(schoolId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; email: string }) => {
      const { data, error, response } = await api.POST('/api/superadmin/schools/{school_id}/admins', {
        params: { path: { school_id: schoolId } },
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schools', schoolId] }),
  })
}
