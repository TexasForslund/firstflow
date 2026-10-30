import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type Track = components['schemas']['TrackRead']

const key = (classId: string) => ['classes', classId, 'tracks'] as const

/** Klassens inriktningar, t.ex. Dator och Programmering, med elevernas id:n. */
export function useClassTracks(classId: string) {
  return useQuery({
    queryKey: key(classId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/classes/{class_id}/tracks', {
        params: { path: { class_id: classId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useCreateTrack(classId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error, response } = await api.POST('/api/classes/{class_id}/tracks', {
        params: { path: { class_id: classId } },
        body: { name },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (tracks) => queryClient.setQueryData(key(classId), tracks),
  })
}

export function useDeleteTrack(classId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (trackId: string) => {
      const { error, response } = await api.DELETE('/api/classes/{class_id}/tracks/{track_id}', {
        params: { path: { class_id: classId, track_id: trackId } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key(classId) })
      // Utkastets frågor slutar gälla inriktningen.
      queryClient.invalidateQueries({ queryKey: ['classes', classId, 'form'] })
    },
  })
}

export function useSetStudentTrack(classId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ studentId, trackId }: { studentId: string; trackId: string | null }) => {
      const { data, error, response } = await api.PUT('/api/classes/{class_id}/students/{student_id}/track', {
        params: { path: { class_id: classId, student_id: studentId } },
        body: { track_id: trackId },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (tracks) => queryClient.setQueryData(key(classId), tracks),
  })
}

/** Elevens inriktning i klassen, eller undefined. */
export function trackOf(tracks: Track[], studentId: string) {
  return tracks.find((t) => t.student_ids.includes(studentId))
}

/** Mjuka färger för inriktningarna, så att de går att skilja åt. */
const TONES = ['sky', 'butter', 'mint', 'primary'] as const

export function trackTone(tracks: Track[], trackId: string) {
  const index = tracks.findIndex((t) => t.id === trackId)
  return TONES[(index < 0 ? 0 : index) % TONES.length]
}
