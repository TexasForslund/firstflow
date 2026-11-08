import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

// Läroplanen från Skolverket och klassens ämnen (idé 13, steg 1, Texas 2026-11-08).

export type Curriculum = components['schemas']['ClassCurriculum']['suggested_curriculum']
export type ClassCurriculum = components['schemas']['ClassCurriculum']
export type SyllabusProgram = components['schemas']['ProgramRead']
export type SubjectGroup = components['schemas']['GroupRead']
export type SubjectLevel = components['schemas']['LevelRead']

export const CURRICULUM_LABEL: Record<Curriculum, string> = { gy25: 'Gy25', gy11: 'Gy11' }

export function usePrograms(curriculum: Curriculum | undefined) {
  return useQuery({
    queryKey: ['syllabus', 'programs', curriculum],
    enabled: !!curriculum,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/syllabus/programs', {
        params: { query: { curriculum: curriculum! } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useProgramGroups(programCode: string | undefined, orientation: string | undefined) {
  return useQuery({
    queryKey: ['syllabus', 'groups', programCode, orientation ?? null],
    enabled: !!programCode,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/syllabus/programs/{program_code}/groups', {
        params: { path: { program_code: programCode! }, query: { orientation: orientation || null } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useClassCurriculum(classId: string) {
  return useQuery({
    queryKey: ['classes', classId, 'curriculum'],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/classes/{class_id}/curriculum', {
        params: { path: { class_id: classId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useSaveClassCurriculum(classId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: components['schemas']['ClassCurriculumWrite']) => {
      const { data, error, response } = await api.PUT('/api/classes/{class_id}/curriculum', {
        params: { path: { class_id: classId } },
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (data) => queryClient.setQueryData(['classes', classId, 'curriculum'], data),
  })
}

/** "Elteknik, nivå 1" (Gy25) eller "Elektroteknik: Elektromekanik" (Gy11). */
export function levelLabel(level: SubjectLevel): string {
  return /^Nivå /.test(level.level_name)
    ? `${level.subject_name}, ${level.level_name.toLowerCase()}`
    : `${level.subject_name}: ${level.level_name}`
}
