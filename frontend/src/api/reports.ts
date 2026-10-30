import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import { overviewKey } from './overview'
import type { components } from './schema'

export type ReportDetail = components['schemas']['ReportDetail']
export type DueReport = components['schemas']['DueReport']
export type AnswerValue = components['schemas']['AnswerValue']
export type AnswerRead = components['schemas']['AnswerRead']
export type Comment = components['schemas']['CommentRead']
export type CommentVisibility = components['schemas']['CommentVisibility']

const keys = {
  mine: ['reports', 'mine'] as const,
  report: (id: string) => ['reports', id] as const,
}

/** Elevens redovisningsdagar de senaste fyra veckorna, nyast först. */
export function useMyReports() {
  return useQuery({
    queryKey: keys.mine,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/reports/mine')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useReport(reportId: string, enabled = true) {
  return useQuery({
    queryKey: keys.report(reportId),
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/reports/{report_id}', {
        params: { path: { report_id: reportId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Startar redovisningen för en dag, eller öppnar den om den redan finns. */
export function useStartReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { class_id: string; due_date: string }) => {
      const { data, error, response } = await api.POST('/api/reports', { body })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (report) => {
      queryClient.setQueryData(keys.report(report.id), report)
      queryClient.invalidateQueries({ queryKey: keys.mine })
    },
  })
}

export function useSaveAnswer(reportId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ questionId, value }: { questionId: string; value: AnswerValue }) => {
      const { data, error, response } = await api.PUT('/api/reports/{report_id}/answers/{question_id}', {
        params: { path: { report_id: reportId, question_id: questionId } },
        body: value,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (report) => queryClient.setQueryData(keys.report(reportId), report),
  })
}

/** Kopplar redovisningen till ett av elevens projekt, eller tar bort kopplingen (null). */
export function useSetReportProject(reportId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string | null) => {
      const { data, error, response } = await api.PUT('/api/reports/{report_id}/project', {
        params: { path: { report_id: reportId } },
        body: { project_id: projectId },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (report) => queryClient.setQueryData(keys.report(reportId), report),
  })
}

export function useSubmitReport(reportId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST('/api/reports/{report_id}/submit', {
        params: { path: { report_id: reportId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (report) => {
      queryClient.setQueryData(keys.report(reportId), report)
      queryClient.invalidateQueries({ queryKey: keys.mine })
    },
  })
}

export function useAddComment(reportId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, visibility = 'all' }: { body: string; visibility?: CommentVisibility }) => {
      const { data, error, response } = await api.POST('/api/reports/{report_id}/comments', {
        params: { path: { report_id: reportId } },
        body: { body, visibility },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<ReportDetail>(keys.report(reportId), (report) =>
        report ? { ...report, comments: [...report.comments, comment] } : report,
      )
      queryClient.invalidateQueries({ queryKey: supervisorKey })
    },
  })
}

export type ReportSummary = components['schemas']['ReportSummary']

const classKey = (classId: string) => ['classes', classId, 'reports'] as const

/** Klassens inskickade redovisningar, senast inskickade först. Bara för klassens lärare. */
export function useClassReports(
  classId: string,
  filter: { unreadOnly?: boolean; studentId?: string } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...classKey(classId), filter],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/classes/{class_id}/reports', {
        params: {
          path: { class_id: classId },
          query: { unread_only: filter.unreadOnly, student_id: filter.studentId, limit: 200 },
        },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Markerar redovisningen som läst av läraren eller handledaren. */
export function useMarkRead(reportId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST('/api/reports/{report_id}/read', {
        params: { path: { report_id: reportId } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: () => {
      queryClient.setQueryData<ReportDetail>(keys.report(reportId), (report) =>
        report ? { ...report, is_read: true } : report,
      )
      const report = queryClient.getQueryData<ReportDetail>(keys.report(reportId))
      if (report) queryClient.invalidateQueries({ queryKey: classKey(report.class_id) })
      queryClient.invalidateQueries({ queryKey: overviewKey })
      queryClient.invalidateQueries({ queryKey: supervisorKey })
    },
  })
}

export type SupervisorReport = components['schemas']['SupervisorReport']

const supervisorKey = ['supervisor', 'reports'] as const

/** Handledarens elevers redovisningar från tiden hos handledaren, senast inskickade först. */
export function useSupervisorReports(enabled = true) {
  return useQuery({
    queryKey: supervisorKey,
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/supervisor/reports', {
        params: { query: { limit: 200 } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}
