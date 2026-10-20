import { useQuery } from '@tanstack/react-query'

import { api } from '../api/client'
import type { components } from '../api/schema'

export type CurrentUser = components['schemas']['MeRead']

/** Den inloggade användaren, eller null om ingen är inloggad. */
export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<CurrentUser | null> => {
      const { data, response } = await api.GET('/api/auth/me')
      if (response.status === 401) return null
      if (!data) throw new Error(`Kunde inte hämta inloggad användare (${response.status})`)
      return data
    },
    retry: false,
    staleTime: Infinity,
  })
}
