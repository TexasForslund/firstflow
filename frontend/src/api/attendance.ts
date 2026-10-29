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
export type DayState = components['schemas']['DayState']
export type ReviewList = components['schemas']['ReviewList']
export type ReviewItem = components['schemas']['ReviewItem']
export type ReviewVerdict = components['schemas']['ReviewVerdict']
export type ClassWeek = components['schemas']['ClassWeek']
export type WeekStudent = components['schemas']['WeekStudent']

const keys = {
  mine: ['me', 'attendance'] as const,
  class: (classId: string, from?: string, to?: string) => ['classes', classId, 'attendance', from, to] as const,
  supervisor: (date?: string) => ['supervisor', 'attendance', date] as const,
  review: ['supervisor', 'attendance', 'review'] as const,
  week: (classId: string, start?: string) => ['classes', classId, 'attendance', 'week', start] as const,
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

/** Dagar som handledaren kan bekräfta: i dag och de som väntar från tidigare. */
export function useReviewList(enabled = true) {
  return useQuery({
    queryKey: keys.review,
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/supervisor/attendance/review')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Handledaren bekräftar dagar, lägger till dagar eleven glömde eller säger "inte på plats". */
export function useReview() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAttendance()
  return useMutation({
    mutationFn: async (items: ReviewVerdict[]) => {
      const { data, error, response } = await api.POST('/api/supervisor/attendance/review', { body: { items } })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(keys.review, data)
      invalidate()
    },
  })
}

/** Klassens närvaro måndag till fredag i veckan som innehåller `start` (standard i dag). */
export function useClassWeek(classId: string, start?: string) {
  return useQuery({
    queryKey: keys.week(classId, start),
    enabled: !!classId,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/classes/{class_id}/attendance/week', {
        params: { path: { class_id: classId }, query: { start } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Påminner handledare som har incheckningar att bekräfta för klassens elever. */
export function useRemindSupervisors(classId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST('/api/classes/{class_id}/attendance/remind', {
        params: { path: { class_id: classId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Tid som "08:30" i svensk tid. */
export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

/** Text för skärmläsare och tooltip för varje läge. */
export function dayStateText(state: DayState, checkedInAt?: string | null) {
  const time = checkedInAt ? ` ${clockTime(checkedInAt)}` : ''
  switch (state) {
    case 'confirmed':
      return checkedInAt ? `Incheckad${time}, bekräftad` : 'Glömde checka in, handledaren lade till dagen'
    case 'pending':
      return `Incheckad${time}, väntar på handledaren`
    case 'not_present':
      return checkedInAt
        ? `Incheckad${time}, men handledaren säger inte på plats`
        : 'Inte på plats enligt handledaren'
    case 'missing':
      return 'Ej incheckad'
  }
}
