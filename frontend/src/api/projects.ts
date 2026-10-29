import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type Project = components['schemas']['ProjectRead']
export type ProjectWrite = components['schemas']['ProjectWrite']

const keys = {
  mine: ['projects'] as const,
  student: (studentId: string) => ['students', studentId, 'projects'] as const,
}

/** Lärarens egna projekt. */
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
