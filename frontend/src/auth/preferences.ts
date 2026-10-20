import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../api/client'
import { ApiError } from '../api/errors'
import type { components } from '../api/schema'
import type { CurrentUser } from './useCurrentUser'

export type DisplayPreferences = components['schemas']['MeRead']['preferences']

export const DEFAULT_PREFERENCES: DisplayPreferences = {
  text_size: 'normal',
  high_contrast: false,
  reduce_motion: 'system',
  more_spacing: false,
}

/** De tre färdiga lägena. Rörelse väljs separat och ingår inte. */
export const PRESETS = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Som Firstflow ser ut från början.',
    values: { text_size: 'normal', high_contrast: false, more_spacing: false },
  },
  {
    id: 'larger',
    label: 'Större',
    description: 'Text cirka 15 % större och mer luft mellan rader och bokstäver.',
    values: { text_size: 'large', high_contrast: false, more_spacing: true },
  },
  {
    id: 'largest',
    label: 'Störst',
    description: 'Text cirka 30 % större, mer luft och ökad kontrast.',
    values: { text_size: 'largest', high_contrast: true, more_spacing: true },
  },
] as const satisfies readonly {
  id: string
  label: string
  description: string
  values: Pick<DisplayPreferences, 'text_size' | 'high_contrast' | 'more_spacing'>
}[]

export function matchingPreset(p: DisplayPreferences) {
  return PRESETS.find(
    (preset) =>
      preset.values.text_size === p.text_size &&
      preset.values.high_contrast === p.high_contrast &&
      preset.values.more_spacing === p.more_spacing,
  )
}

const STORAGE_KEY = 'firstflow-display'

/**
 * Sätter inställningarna som attribut på <html>. Reglerna finns i index.css.
 * Sparas också i webbläsaren, så att inloggningssidan och nästa sidladdning ser rätt ut direkt.
 */
export function applyPreferences(p: DisplayPreferences) {
  const root = document.documentElement
  root.dataset.textSize = p.text_size
  root.dataset.contrast = p.high_contrast ? 'high' : 'normal'
  root.dataset.motion = p.reduce_motion === 'always' ? 'reduce' : 'system'
  root.dataset.spacing = p.more_spacing ? 'more' : 'normal'
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    // Privat läge eller blockerad lagring: inställningarna gäller ändå för den här sidan.
  }
}

/** Inställningarna från förra besöket på den här enheten. Körs innan appen ritas. */
export function applyCachedPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) applyPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(raw) })
  } catch {
    // Ingen sparad inställning: standard gäller.
  }
}

export function useSavePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (preferences: DisplayPreferences) => {
      const { data, error, response } = await api.PUT('/api/me/preferences', { body: preferences })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (preferences) =>
      queryClient.setQueryData<CurrentUser | null>(['me'], (user) => (user ? { ...user, preferences } : user)),
  })
}

export function useLogoutOtherDevices() {
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST('/api/me/sessions/logout-others')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}
