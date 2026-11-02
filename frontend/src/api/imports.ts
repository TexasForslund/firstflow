import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type ImportPreview = components['schemas']['ImportPreview']
export type ImportPerson = components['schemas']['ImportPerson']
export type ImportResult = components['schemas']['ImportResult']

type Body = components['schemas']['Body_preview_api_import_preview_post']
type RunBody = components['schemas']['Body_run_api_import_run_post']

function form(file: File, classes: string[], extra: Record<string, string> = {}): FormData {
  const data = new FormData()
  data.append('file', file)
  for (const name of classes) data.append('classes', name)
  for (const [key, value] of Object.entries(extra)) data.append(key, value)
  return data
}

/** Vad som händer om filen importeras med klasserna. Utan klasser: filens klasser. */
export function useImportPreview() {
  return useMutation({
    mutationFn: async ({ file, classes }: { file: File; classes: string[] }) => {
      const { data, error, response } = await api.POST('/api/import/preview', {
        // Typen säger att filen är en sträng, men API:t tar emot multipart.
        body: form(file, classes) as unknown as Body,
        bodySerializer: (body) => body as unknown as FormData,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useRunImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, classes, sendInvites }: { file: File; classes: string[]; sendInvites: boolean }) => {
      const { data, error, response } = await api.POST('/api/import/run', {
        body: form(file, classes, { send_invites: String(sendInvites) }) as unknown as RunBody,
        bodySerializer: (body) => body as unknown as FormData,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    // Klasser, elever och personal har ändrats.
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
