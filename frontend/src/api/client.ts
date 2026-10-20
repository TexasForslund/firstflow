import createClient, { type Middleware } from 'openapi-fetch'

import { queryClient } from './queryClient'
import type { paths } from './schema'

// Typad klient mot backend. Typerna genereras från backend/openapi.json med `npm run gen:api`.
export const api = createClient<paths>({ baseUrl: '' })

// Svarar backend 401 har sessionen gått ut. Då sätts den inloggade användaren till null,
// så att skyddade sidor skickar vidare till /login. Ett misslyckat inloggningsförsök räknas inte.
const sessionExpired: Middleware = {
  onResponse({ request, response }) {
    if (response.status === 401 && !request.url.endsWith('/api/auth/login')) {
      queryClient.setQueryData(['me'], null)
    }
  },
}

api.use(sessionExpired)
