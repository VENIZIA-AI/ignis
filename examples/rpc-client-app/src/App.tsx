import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { hc } from 'hono/client'

import type { ITypedClient, IHealthCheckResponse } from '../../vert/src/rpc-types'

const client = hc('http://0.0.0.0:1190/v1/api') as unknown as ITypedClient

function App() {
  const [count, setCount] = useState(0)
  const [healthStatus, setHealthStatus] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)


  const checkHealth = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await client['health-check'].$get()

      if (response.ok) {
        const data: IHealthCheckResponse = await response.json()
        setHealthStatus(data.status)
      } else {
        setError(`Server error: ${response.status} ${response.statusText}`)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(`Network error: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Ignis RPC Demo</h1>

      {/* Health Check Section */}
      <div className="card">
        <h2>API Health Check</h2>
        <button onClick={checkHealth} disabled={isLoading}>
          {isLoading ? 'Checking...' : 'Check Server Health'}
        </button>

        {healthStatus && (
          <p style={{ color: 'green', marginTop: '1rem' }}>
            ✓ Server Status: <strong>{healthStatus}</strong>
          </p>
        )}

        {error && (
          <p style={{ color: 'red', marginTop: '1rem' }}>
            ✗ Error: {error}
          </p>
        )}
      </div>

      {/* Original Counter Example */}
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>

      <p className="read-the-docs">
        Type-safe RPC with Hono + Ignis Framework
      </p>
    </>
  )
}

export default App
