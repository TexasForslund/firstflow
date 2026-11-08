import { useQuery } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type GradeBasis = components['schemas']['GradeBasis']
export type GradeSubject = components['schemas']['GradeSubject']
export type GoalOverview = components['schemas']['GoalOverview']

/** Underlag inför betyg för en elev (idé 13, steg 8). */
export function useGradeBasis(studentId: string) {
  return useQuery({
    queryKey: ['students', studentId, 'grade-basis'],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/students/{student_id}/grade-basis', {
        params: { path: { student_id: studentId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}
