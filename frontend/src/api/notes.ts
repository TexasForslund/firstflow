import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type StudentNote = components['schemas']['NoteRead']
export type NoteTag = components['schemas']['NoteTag']
export type NoteWrite = components['schemas']['NoteWrite']

export const noteTagLabel: Record<NoteTag, string> = {
  praise: 'Beröm',
  concern: 'Oro',
  other: 'Övrigt',
}

const key = (studentId: string) => ['students', studentId, 'notes'] as const

/** Anteckningar om eleven, senaste först. Handledaren ser sina egna, läraren alla. */
export function useStudentNotes(studentId: string, enabled = true) {
  return useQuery({
    queryKey: key(studentId),
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/students/{student_id}/notes', {
        params: { path: { student_id: studentId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useCreateNote(studentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: NoteWrite) => {
      const { data, error, response } = await api.POST('/api/students/{student_id}/notes', {
        params: { path: { student_id: studentId } },
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(studentId) }),
  })
}

export function useUpdateNote(studentId: string, noteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: NoteWrite) => {
      const { data, error, response } = await api.PUT('/api/students/{student_id}/notes/{note_id}', {
        params: { path: { student_id: studentId, note_id: noteId } },
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(studentId) }),
  })
}

export function useDeleteNote(studentId: string, noteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error, response } = await api.DELETE('/api/students/{student_id}/notes/{note_id}', {
        params: { path: { student_id: studentId, note_id: noteId } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(studentId) }),
  })
}
