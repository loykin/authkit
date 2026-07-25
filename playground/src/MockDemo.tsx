import { useState } from 'react'
import { createMockAuthManager } from '@loykin/authkit/testing'
import { AuthProvider, useAuthManager, useCanAuth } from '@loykin/authkit/react'
import { AuthPanel } from './AuthPanel'
import { scenarios } from './scenarios'
import type { PlaygroundUser } from './adapters/session'

function ScenarioButtons() {
  const auth = useAuthManager<PlaygroundUser>() as ReturnType<
    typeof createMockAuthManager<PlaygroundUser>
  >

  return (
    <div className="button-row">
      {(Object.keys(scenarios) as (keyof typeof scenarios)[]).map((key) => (
        <button key={key} onClick={() => auth.mock.setScenario(scenarios[key])}>
          {key}
        </button>
      ))}
    </div>
  )
}

function PermissionControls() {
  const auth = useAuthManager<PlaygroundUser>() as ReturnType<
    typeof createMockAuthManager<PlaygroundUser>
  >

  return (
    <div className="button-row">
      <button onClick={() => auth.mock.grant('dashboard:archive')}>
        grant(&quot;dashboard:archive&quot;)
      </button>
      <button onClick={() => auth.mock.revoke('dashboard:archive')}>
        revoke(&quot;dashboard:archive&quot;)
      </button>
      <CanAuthProbe />
    </div>
  )
}

function CanAuthProbe() {
  // useCanAuth() (not manager.can() called inline) is what makes this reactive —
  // it subscribes via useSyncExternalStore so this span re-renders when grants change.
  const canArchive = useCanAuth('dashboard:archive')
  return <span>can(dashboard:archive) = {String(canArchive)}</span>
}

function RefreshAndUnauthorizedControls() {
  const auth = useAuthManager<PlaygroundUser>() as ReturnType<
    typeof createMockAuthManager<PlaygroundUser>
  >
  const [result, setResult] = useState('')

  return (
    <div className="button-row">
      <button onClick={() => auth.mock.setRefreshResult('success')}>
        setRefreshResult(&quot;success&quot;)
      </button>
      <button onClick={() => auth.mock.setRefreshResult('failure')}>
        setRefreshResult(&quot;failure&quot;)
      </button>
      <button
        onClick={async () => {
          setResult('triggering…')
          await auth.mock.triggerUnauthorized()
          setResult('done — see event log below')
        }}
      >
        triggerUnauthorized()
      </button>
      <span>{result}</span>
    </div>
  )
}

export function MockDemo() {
  const [manager] = useState(() =>
    createMockAuthManager<PlaygroundUser>({ scenario: scenarios.admin }),
  )

  return (
    <AuthProvider manager={manager}>
      <p className="hint">
        No network at all — createMockAuthManager() drives the exact same AuthManager contract as
        the real backend demo (4.7 real/mock parity).
      </p>
      <ScenarioButtons />
      <PermissionControls />
      <RefreshAndUnauthorizedControls />
      <AuthPanel />
    </AuthProvider>
  )
}
