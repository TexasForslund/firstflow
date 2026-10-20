import { QueryClient } from '@tanstack/react-query'

// En gemensam QueryClient, så att API-klienten kan nollställa inloggningen vid 401.
export const queryClient = new QueryClient()
