import { useState } from 'react'
import { createAuthManager } from '@loykin/authkit'
import { AuthProvider, useAuth, useAuthManager } from '@loykin/authkit/react'
import { AuthPanel } from './AuthPanel'
import { API_BASE, sessionAdapter, type PlaygroundUser } from './adapters/session'
import { permissionSource } from './adapters/permissions'

function LoginForm() {
  const { status, login } = useAuth<PlaygroundUser>()
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('password')
  const [loginError, setLoginError] = useState<string | null>(null)

  if (status === 'authenticated') return null

  return (
    <form
      className="login-form"
      onSubmit={(e) => {
        e.preventDefault()
        setLoginError(null)
        login({ email, password }).catch((err: unknown) => {
          setLoginError(err instanceof Error ? err.message : String(err))
        })
      }}
    >
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        type="password"
      />
      <button type="submit">Login</button>
      {loginError && <p className="error">{loginError}</p>}
      <p className="hint">
        try admin@example.com or viewer@example.com, password is &quot;password&quot;
      </p>
    </form>
  )
}

function FetchDemo() {
  const manager = useAuthManager()
  const [result, setResult] = useState('')

  async function fetchDashboards() {
    setResult('loading…')
    try {
      const res = await manager.fetch(`${API_BASE}/api/dashboards`)
      setResult(`${res.status} ${JSON.stringify(await res.json())}`)
    } catch (err) {
      setResult(`error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function expireThenFetch() {
    setResult('expiring session on the server…')
    await fetch(`${API_BASE}/api/debug/expire`, { method: 'POST', credentials: 'include' })
    setResult('server session invalidated — fetching /api/dashboards (should 401 then auto-refresh+retry)…')
    await fetchDashboards()
  }

  return (
    <div className="button-row">
      <button onClick={() => void fetchDashboards()}>Fetch /api/dashboards</button>
      <button onClick={() => void expireThenFetch()}>
        Expire session on server, then fetch (proves 401 → refresh → retry)
      </button>
      <pre className="result">{result}</pre>
    </div>
  )
}

export function RealBackendDemo() {
  const [manager] = useState(() =>
    createAuthManager<PlaygroundUser, { email: string; password: string }>({
      session: sessionAdapter,
      permissions: permissionSource,
    }),
  )

  return (
    <AuthProvider manager={manager}>
      <p className="hint">
        Backed by a real Node server at {API_BASE} (see <code>playground/server/index.mjs</code>).
        Session is an httpOnly cookie — Phase 1/2 code runs against real HTTP.
      </p>
      {import.meta.env.PROD && (
        <p className="error">
          This tab needs that server running locally — it won&apos;t work on a static deploy.
          Clone the repo and run <code>pnpm server</code> in <code>playground/</code>, or use the
          Mock manager tab above.
        </p>
      )}
      <LoginForm />
      <FetchDemo />
      <AuthPanel />
    </AuthProvider>
  )
}
