import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

// Läroplanen från Skolverket och klassens ämnen (idé 13, steg 1, Texas 2026-11-08).

export type Curriculum = NonNullable<components['schemas']['ClassCurriculum']['curriculum']>
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

export function useProgramGroups(programCode: string | null | undefined, orientations: string[]) {
  return useQuery({
    queryKey: ['syllabus', 'groups', programCode, [...orientations].sort()],
    enabled: !!programCode,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/syllabus/programs/{program_code}/groups', {
        params: { path: { program_code: programCode! }, query: { orientation: orientations } },
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

function useSetCurriculum<T>(classId: string, send: (body: T) => Promise<ClassCurriculum>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSuccess: (data) => queryClient.setQueryData(['classes', classId, 'curriculum'], data),
  })
}

/** Skoladmin väljer läroplan och program. */
export function useSaveClassProgram(classId: string) {
  return useSetCurriculum(classId, async (body: components['schemas']['ProgramWrite']) => {
    const { data, error, response } = await api.PUT('/api/classes/{class_id}/program', {
      params: { path: { class_id: classId } },
      body,
    })
    if (!data) throw new ApiError(error, response.status)
    return data
  })
}

/** Skoladmin kopplar en inriktning i klassen till Skolverkets. */
export function useSaveTrackOrientation(classId: string) {
  return useSetCurriculum(classId, async ({ trackId, code }: { trackId: string; code: string | null }) => {
    const { data, error, response } = await api.PUT('/api/classes/{class_id}/tracks/{track_id}/orientation', {
      params: { path: { class_id: classId, track_id: trackId } },
      body: { orientation_code: code },
    })
    if (!data) throw new ApiError(error, response.status)
    return data
  })
}

/** Läraren väljer ämnen. */
export function useSaveClassSubjects(classId: string) {
  return useSetCurriculum(classId, async (levelCodes: string[]) => {
    const { data, error, response } = await api.PUT('/api/classes/{class_id}/subjects', {
      params: { path: { class_id: classId } },
      body: { level_codes: levelCodes },
    })
    if (!data) throw new ApiError(error, response.status)
    return data
  })
}

/**
 * Klasser heter ofta efter startåret, till exempel EE23. Startår 2025 eller senare läser Gy25.
 * Används som förslag när klassen skapas. Samma regel som `suggested_curriculum` i backend.
 */
export function suggestCurriculum(name: string): Curriculum {
  const years = name.match(/(?<!\d)\d{2}(?!\d)/g)
  if (!years) return 'gy25'
  return Number(years[years.length - 1]) >= 25 ? 'gy25' : 'gy11'
}

/** "Elteknik, nivå 1" (Gy25) eller "Elektroteknik: Elektromekanik" (Gy11). */
export function levelLabel(level: SubjectLevel): string {
  return /^Nivå /.test(level.level_name)
    ? `${level.subject_name}, ${level.level_name.toLowerCase()}`
    : `${level.subject_name}: ${level.level_name}`
}
