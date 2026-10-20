import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { queryClient } from './api/queryClient'
import App from './App.tsx'
import { applyCachedPreferences } from './auth/preferences'
import './index.css'

// Textstorlek, kontrast m.m. från förra besöket, innan något ritas.
applyCachedPreferences()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
