import createClient from 'openapi-fetch'

import type { paths } from './schema'

// Typad klient mot backend. Typerna genereras från backend/openapi.json med `npm run gen:api`.
export const api = createClient<paths>({ baseUrl: '' })
