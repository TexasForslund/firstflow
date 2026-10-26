import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import { formKey } from './forms'
import type { components } from './schema'

export type Template = components['schemas']['TemplateRead']

const templatesKey = ['templates'] as const

/** Skolans mallar och användarens egna. Skolans kommer först. */
export function useTemplates(enabled = true) {
  return useQuery({
    queryKey: templatesKey,
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/templates')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Sparar klassens frågor (utkastet) som mall. Skoladmin skapar skolans mallar, läraren egna. */
export function useCreateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; class_id: string }) => {
      const { data, error, response } = await api.POST('/api/templates', { body })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey }),
  })
}

export function useRenameTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error, response } = await api.PATCH('/api/templates/{template_id}', {
        params: { path: { template_id: id } },
        body: { name },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey }),
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/api/templates/{template_id}', {
        params: { path: { template_id: id } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey }),
  })
}

/** Kopierar mallens frågor till klassens utkast. Mallen ersätter utkastet. */
export function useApplyTemplate(classId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error, response } = await api.POST('/api/classes/{class_id}/form/apply-template', {
        params: { path: { class_id: classId } },
        body: { template_id: templateId },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (form) => queryClient.setQueryData(formKey(classId), form),
  })
}
