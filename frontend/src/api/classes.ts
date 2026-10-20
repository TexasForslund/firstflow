import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type ClassSummary = components['schemas']['ClassSummary']
export type ClassDetail = components['schemas']['ClassDetail']
export type Person = components['schemas']['PersonRead']
export type AplTerms = components['schemas']['AplTerms']

const keys = {
  classes: ['classes'] as const,
  class: (id: string) => ['classes', id] as const,
  teachers: (schoolId: string) => ['schools', schoolId, 'teachers'] as const,
}

export function useClasses(enabled = true) {
  return useQuery({
    queryKey: keys.classes,
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/classes')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useClass(classId: string) {
  return useQuery({
    queryKey: keys.class(classId),
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/classes/{class_id}', {
        params: { path: { class_id: classId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useSchoolTeachers(schoolId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.teachers(schoolId ?? ''),
    enabled: enabled && !!schoolId,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/schools/{school_id}/users', {
        params: { path: { school_id: schoolId! }, query: { role: 'teacher' } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useCreateClass() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error, response } = await api.POST('/api/classes', { body: { name } })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (created) => {
      queryClient.setQueryData(keys.class(created.id), created)
      queryClient.invalidateQueries({ queryKey: keys.classes, exact: true })
    },
  })
}

/** Invaliderar klassen, klasslistan (antal elever) och elevsidorna. */
function useInvalidateClass(classId: string) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: keys.classes })
    queryClient.invalidateQueries({ queryKey: ['students'] })
    return queryClient.invalidateQueries({ queryKey: keys.class(classId) })
  }
}

export function useAddStudent(classId: string) {
  const invalidate = useInvalidateClass(classId)
  return useMutation({
    mutationFn: async (studentId: string) => {
      const { data, error, response } = await api.POST('/api/classes/{class_id}/students', {
        params: { path: { class_id: classId } },
        body: { student_id: studentId },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: invalidate,
  })
}

export function useRemoveStudent(classId: string) {
  const invalidate = useInvalidateClass(classId)
  return useMutation({
    mutationFn: async (studentId: string) => {
      const { error, response } = await api.DELETE('/api/classes/{class_id}/students/{student_id}', {
        params: { path: { class_id: classId, student_id: studentId } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: invalidate,
  })
}

export function useAssignTeacher(classId: string) {
  const invalidate = useInvalidateClass(classId)
  return useMutation({
    mutationFn: async (teacherId: string) => {
      const { data, error, response } = await api.POST('/api/classes/{class_id}/teachers', {
        params: { path: { class_id: classId } },
        body: { teacher_id: teacherId },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUnassignTeacher(classId: string) {
  const invalidate = useInvalidateClass(classId)
  return useMutation({
    mutationFn: async (teacherId: string) => {
      const { error, response } = await api.DELETE('/api/classes/{class_id}/teachers/{teacher_id}', {
        params: { path: { class_id: classId, teacher_id: teacherId } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: invalidate,
  })
}

export function useSetAplTerms(classId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (terms: AplTerms) => {
      const { data, error, response } = await api.PUT('/api/classes/{class_id}/apl-terms', {
        params: { path: { class_id: classId } },
        body: terms,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (updated) => queryClient.setQueryData(['classes', classId], updated),
  })
}
