import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type Goal = components['schemas']['GoalRead']
export type GoalCount = components['schemas']['GoalCount']
export type GoalEvidence = components['schemas']['EvidenceRead']
export type ProjectGoals = components['schemas']['ProjectGoals']

const goalsKey = ['goals'] as const

/** Skolans mål (idé 10). Med klassen kommer klassens mål från läroplanen först (idé 13). */
export function useGoals(enabled = true, classId?: string) {
  return useQuery({
    queryKey: [...goalsKey, classId ?? 'school'],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/goals', {
        params: { query: classId ? { class_id: classId } : {} },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Klassens mål för klasserna som eleverna går i, för projektets förslag (idé 13, steg 4). */
export function useGoalsForStudents(studentIds: string[], enabled = true) {
  const ids = [...studentIds].sort()
  return useQuery({
    queryKey: [...goalsKey, 'students', ids],
    enabled: enabled && ids.length > 0,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/goals/for-students', {
        params: { query: { student_id: ids } },
      })
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

/** Målen i grupper: klassens mål per ämne, sist skolans mål ("Utan koppling"). */
export function goalGroups(goals: Goal[]): { title: string | null; goals: Goal[] }[] {
  const groups: { title: string | null; goals: Goal[] }[] = []
  for (const goal of goals) {
    const title = goal.group ?? (goals.some((g) => g.group) ? 'Utan koppling' : null)
    const last = groups[groups.length - 1]
    if (last && last.title === title) last.goals.push(goal)
    else groups.push({ title, goals: [goal] })
  }
  return groups
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
