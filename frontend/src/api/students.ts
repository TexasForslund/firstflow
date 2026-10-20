import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type Student = components['schemas']['StudentRead']
export type StudentCreate = components['schemas']['StudentCreate']

/**
 * Elever. Läraren får elever som är kopplade till hen, skolans personal får skolans alla.
 * Hämtar upp till 500 och filtrerar i webbläsaren, vilket räcker för en skola.
 */
export function useStudents(enabled = true) {
  return useQuery({
    queryKey: ['students', 'list'],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/students', {
        params: { query: { limit: 500 } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useStudent(studentId: string) {
  return useQuery({
    queryKey: ['students', studentId],
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/students/{student_id}', {
        params: { path: { student_id: studentId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useCreateStudent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: StudentCreate) => {
      const { data, error, response } = await api.POST('/api/students', { body })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['classes'] })
    },
  })
}

export function useSetTeachers(studentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (teacherIds: string[]) => {
      const { data, error, response } = await api.PUT('/api/students/{student_id}/teachers', {
        params: { path: { student_id: studentId } },
        body: { teacher_ids: teacherIds },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (student) => {
      queryClient.setQueryData(['students', studentId], student)
      queryClient.invalidateQueries({ queryKey: ['students', 'list'] })
    },
  })
}
