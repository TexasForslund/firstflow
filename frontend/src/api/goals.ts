import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type Goal = components['schemas']['GoalRead']
export type GoalCount = components['schemas']['GoalCount']
export type GoalEvidence = components['schemas']['EvidenceRead']
export type ProjectGoals = components['schemas']['ProjectGoals']

const goalsKey = ['goals'] as const

/** Skolans mål (idé 10). */
export function useGoals(enabled = true) {
  return useQuery({
    queryKey: goalsKey,
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/goals')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useCreateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error, response } = await api.POST('/api/goals', { body: { name } })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: goalsKey }),
  })
}

/** Elevens underlag per mål, flest först. */
export function useStudentGoals(studentId: string, enabled = true) {
  return useQuery({
    queryKey: ['students', studentId, 'goals'],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/students/{student_id}/goals', {
        params: { path: { student_id: studentId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Projektets mål och hur många gånger varje elev har visat dem. */
export function useProjectGoals(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'goals'],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/projects/{project_id}/goals', {
        params: { path: { project_id: projectId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}
