import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type Project = components['schemas']['ProjectRead']
export type ProjectWrite = components['schemas']['ProjectWrite']
export type ProjectReport = components['schemas']['ProjectReport']

const keys = {
  mine: ['projects'] as const,
  one: (projectId: string) => ['projects', projectId] as const,
  reports: (projectId: string, studentId?: string) => ['projects', projectId, 'reports', studentId ?? 'all'] as const,
  student: (studentId: string) => ['students', studentId, 'projects'] as const,
}

/** Lärarens egna projekt, eller projekten handledaren är inbjuden till. */
export function useProjects() {
  return useQuery({
    queryKey: keys.mine,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/projects')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Elevens pågående projekt. */
export function useMyProjects(enabled = true) {
  return useQuery({
    queryKey: ['me', 'projects'],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/me/projects')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useStudentProjects(studentId: string) {
  return useQuery({
    queryKey: keys.student(studentId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/students/{student_id}/projects', {
        params: { path: { student_id: studentId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: keys.one(projectId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/projects/{project_id}', {
        params: { path: { project_id: projectId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Inskickade redovisningar i projektet, valfritt för en elev. */
export function useProjectReports(projectId: string, studentId?: string) {
  return useQuery({
    queryKey: keys.reports(projectId, studentId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/projects/{project_id}/reports', {
        params: { path: { project_id: projectId }, query: { student_id: studentId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

function useInvalidateProjects() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: keys.mine })
    // Elevsidan och Elevhistorik visar elevens projekt.
    queryClient.invalidateQueries({ queryKey: ['students'] })
  }
}

export function useSaveProject(projectId?: string) {
  const invalidate = useInvalidateProjects()
  return useMutation({
    mutationFn: async (body: ProjectWrite) => {
      const { data, error, response } = projectId
        ? await api.PUT('/api/projects/{project_id}', { params: { path: { project_id: projectId } }, body })
        : await api.POST('/api/projects', { body })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteProject() {
  const invalidate = useInvalidateProjects()
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error, response } = await api.DELETE('/api/projects/{project_id}', {
        params: { path: { project_id: projectId } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: invalidate,
  })
}
