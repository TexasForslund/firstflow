import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import { shrinkImage } from './reportImages'
import type { components } from './schema'

export type SummaryForm = components['schemas']['SummaryForm']
export type SummaryRead = components['schemas']['SummaryRead']
export type SummaryWrite = components['schemas']['SummaryWrite']
export type StudentSummary = components['schemas']['StudentSummary']

/** Högst antal bilder på slutresultatet (Texas 2026-11-07). */
export const MAX_SUMMARY_IMAGES = 4

const pendingKey = ['me', 'project-summaries'] as const

/** Klara projekt som eleven inte har sammanfattat (idé 12:6, steg 2). */
export function usePendingSummaries() {
  return useQuery({
    queryKey: pendingKey,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/me/project-summaries')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useMySummary(projectId: string) {
  return useQuery({
    queryKey: [...pendingKey, projectId],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/me/project-summaries/{project_id}', {
        params: { path: { project_id: projectId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useSaveSummary(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: SummaryWrite) => {
      const { data, error, response } = await api.PUT('/api/me/project-summaries/{project_id}', {
        params: { path: { project_id: projectId } },
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pendingKey }),
  })
}

export function useUploadSummaryImage(projectId: string) {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', await shrinkImage(file), 'bild.jpg')
      const { data, error, response } = await api.POST('/api/me/project-summaries/{project_id}/images', {
        params: { path: { project_id: projectId } },
        // Typen säger att filen är en sträng, men API:t tar emot multipart.
        body: form as unknown as components['schemas']['Body_upload_summary_image_api_me_project_summaries__project_id__images_post'],
        bodySerializer: (body) => body as unknown as FormData,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function mySummaryImageUrl(projectId: string, imageId: string): string {
  return `/api/me/project-summaries/${projectId}/images/${imageId}`
}

/** Läraren och handledaren: varje elevs sammanfattning, eller när påminnelsen skickades. */
export function useProjectSummaries(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['projects', projectId, 'summaries'],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/projects/{project_id}/summaries', {
        params: { path: { project_id: projectId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function summaryImageUrl(projectId: string, imageId: string): string {
  return `/api/projects/${projectId}/summary-images/${imageId}`
}
