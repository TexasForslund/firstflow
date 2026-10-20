import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type FormRead = components['schemas']['FormRead']
export type Question = FormRead['draft']['questions'][number]
export type QuestionType = Question['type']
export type ChoiceQuestion = components['schemas']['ChoiceQuestion-Output']
export type LogicRule = components['schemas']['LogicRule']

export const formKey = (classId: string) => ['classes', classId, 'form'] as const

export function useClassForm(classId: string) {
  return useQuery({
    queryKey: formKey(classId),
    // Utkastet hämtas en gång. Byggaren håller sedan sin egen kopia medan läraren skriver.
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/classes/{class_id}/form', {
        params: { path: { class_id: classId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useSaveDraft(classId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (questions: Question[]) => {
      const { data, error, response } = await api.PUT('/api/classes/{class_id}/form', {
        params: { path: { class_id: classId } },
        body: { questions },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (form) => queryClient.setQueryData(formKey(classId), form),
  })
}

export function usePublishForm(classId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST('/api/classes/{class_id}/form/publish', {
        params: { path: { class_id: classId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (form) => queryClient.setQueryData(formKey(classId), form),
  })
}

export function useDiscardForm(classId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST('/api/classes/{class_id}/form/discard', {
        params: { path: { class_id: classId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (form) => queryClient.setQueryData(formKey(classId), form),
  })
}
