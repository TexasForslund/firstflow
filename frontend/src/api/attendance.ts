import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type AttendanceStatus = components['schemas']['AttendanceStatus']
export type AttendanceDay = components['schemas']['AttendanceDay']
export type MyAttendance = components['schemas']['MyAttendance']
export type ClassAttendance = components['schemas']['ClassAttendance']
export type StudentAttendance = components['schemas']['StudentAttendance']
export type SupervisorAttendance = components['schemas']['SupervisorAttendance']
export type AbsenceCreate = components['schemas']['AbsenceCreate']

const keys = {
  mine: ['me', 'attendance'] as const,
  class: (classId: string, from?: string, to?: string) => ['classes', classId, 'attendance', from, to] as const,
  supervisor: (date?: string) => ['supervisor', 'attendance', date] as const,
}

/** Elevens dagar under den pågående placeringen. */
export function useMyAttendance() {
  return useQuery({
    queryKey: keys.mine,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/me/attendance')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

function useInvalidateAttendance() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey.includes('attendance'),
    })
}

export function useCheckIn() {
  const invalidate = useInvalidateAttendance()
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST('/api/attendance/check-in')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: invalidate,
  })
}

export function useReportAbsence() {
  const invalidate = useInvalidateAttendance()
  return useMutation({
    mutationFn: async (body: AbsenceCreate) => {
      const { data, error, response } = await api.POST('/api/attendance/absence', { body })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: invalidate,
  })
}

/** Närvaron per elev i klassen. Utan period gäller de senaste fyra veckorna. */
export function useClassAttendance(classId: string, from?: string, to?: string) {
  return useQuery({
    queryKey: keys.class(classId, from, to),
    enabled: !!classId,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/classes/{class_id}/attendance', {
        params: { path: { class_id: classId }, query: { from, to } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Dagens incheckningar för handledarens elever. */
export function useSupervisorAttendance(date?: string) {
  return useQuery({
    queryKey: keys.supervisor(date),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/supervisor/attendance', {
        params: { query: { date } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}
