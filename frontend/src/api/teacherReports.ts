import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type TeacherReport = components['schemas']['TeacherReport']
export type ReportCounts = components['schemas']['ReportCounts']
export type MissingReport = components['schemas']['MissingReport']
export type StudentReportStats = components['schemas']['StudentReportStats']
export type ReportShow = 'all' | 'unread' | 'late' | 'comments' | 'private'

export const teacherReportsKey = ['teacher-reports'] as const

export type ReportFilters = { classId?: string; studentId?: string; projectId?: string }

/** Inskickade redovisningar i lärarens klasser, med antal per snabbval. */
export function useTeacherReports(filters: ReportFilters & { show: ReportShow; limit: number }, enabled = true) {
  return useQuery({
    queryKey: [...teacherReportsKey, 'list', filters],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/teacher/reports', {
        params: {
          query: {
            class_id: filters.classId,
            student_id: filters.studentId,
            project_id: filters.projectId,
            show: filters.show,
            limit: filters.limit,
          },
        },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Redovisningsdagar de senaste fyra veckorna där eleven inte har redovisat. */
export function useMissingReports(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: [...teacherReportsKey, 'missing', filters],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/teacher/reports/missing', {
        params: { query: { class_id: filters.classId, student_id: filters.studentId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Per elev: senaste redovisning, olästa och saknade. */
export function useStudentReportStats(classId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...teacherReportsKey, 'students', classId ?? 'all'],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/teacher/reports/students', {
        params: { query: { class_id: classId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}
