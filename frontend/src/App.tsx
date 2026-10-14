import { useQuery } from '@tanstack/react-query'

import { api } from './api/client'

function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/health')
      if (error) throw error
      return data
    },
  })

  return (
    <main>
      <h1>Firstflow</h1>
      <p>APL från avtal till bedömningsunderlag, i ett sammanhängande flöde.</p>
      <p className="status">
        Backend:{' '}
        {health.isPending ? 'ansluter…' : health.isError ? 'inte nåbar' : health.data.status}
      </p>
    </main>
  )
}

export default App
