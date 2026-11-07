import { useMutation } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type ReportImage = components['schemas']['ImageRead']

/** Längsta sidan efter att bilden gjorts mindre. Servern gör samma sak igen. */
const MAX_SIDE = 1600

/**
 * Gör en bild från mobilen mindre innan den skickas (Texas, 2026-11-07: "nästan alla bilder
 * tas direkt från telefonen … därför är det viktigt att de komprimeras"). En bild från en
 * iPhone på 5–12 MB blir några hundra kB. Går bilden inte att läsa här skickas originalet, och
 * servern försöker då själv.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // JPEG, eftersom Safari inte kan spara WebP från en canvas. Servern gör om den till WebP.
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.85))
}

export function reportImageUrl(reportId: string, imageId: string): string {
  return `/api/reports/${reportId}/images/${imageId}`
}

export function useUploadReportImage(reportId: string) {
  return useMutation({
    mutationFn: async ({ questionId, file }: { questionId: string; file: File }) => {
      const form = new FormData()
      form.append('question_id', questionId)
      form.append('file', await shrinkImage(file), 'bild.jpg')
      const { data, error, response } = await api.POST('/api/reports/{report_id}/images', {
        params: { path: { report_id: reportId } },
        // Typen säger att filen är en sträng, men API:t tar emot multipart.
        body: form as unknown as components['schemas']['Body_upload_image_api_reports__report_id__images_post'],
        bodySerializer: (body) => body as unknown as FormData,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useDeleteReportImage(reportId: string) {
  return useMutation({
    mutationFn: async (imageId: string) => {
      const { error, response } = await api.DELETE('/api/reports/{report_id}/images/{image_id}', {
        params: { path: { report_id: reportId, image_id: imageId } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
  })
}
