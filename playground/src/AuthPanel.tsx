import { useEffect, useState } from 'react'
import { Anonymous, Authenticated, CanAuth, useAuth, useAuthManager } from '@loykin/authkit/react'
import type { AuthEvent } from '@loykin/authkit'
import type { PlaygroundUser } from './adapters/session'

function PermissionButton({
  action,
  resource,
  label,
}: {
  action: string
  resource: string
  label: string
}) {
  return (
    <CanAuth
      action={action}
      resource={resource}
      fallback={
        <button disabled title={`denied: ${action} ${resource}`}>
          {label}
        </button>
      }
    >
      <button onClick={() => alert(`${label} — allowed!`)}>{label}</button>
    </CanAuth>
  )
}

export function AuthPanel() {
  const { status, user, refreshing, error, permissionStatus, logout } = useAuth<PlaygroundUser>()
  const manager = useAuthManager<PlaygroundUser>()
  const [events, setEvents] = useState<string[]>([])

  useEffect(() => {
    return manager.subscribeEvent((event: AuthEvent<PlaygroundUser>) => {
      setEvents((prev) => [
        `${new Date().toLocaleTimeString()}  ${event.type}`,
        ...prev.slice(0, 19),
      ])
    })
  }, [manager])

  return (
    <div className="panel">
      <dl className="state">
        <dt>status</dt>
        <dd>{status}</dd>
        <dt>user</dt>
        <dd>{user ? `${user.email} (${user.roles.join(', ')})` : 'null'}</dd>
        <dt>refreshing</dt>
        <dd>{String(refreshing)}</dd>
        <dt>permissionStatus</dt>
        <dd>{permissionStatus}</dd>
        <dt>error</dt>
        <dd>{error ? error.message : 'null'}</dd>
      </dl>

      <Authenticated>
        <p className="hint">Authenticated — showing user menu.</p>
      </Authenticated>
      <Anonymous>
        <p className="hint">Anonymous — showing login prompt.</p>
      </Anonymous>

      <div className="button-row">
        <PermissionButton action="create" resource="dashboard" label="Create dashboard" />
        <PermissionButton action="update" resource="dashboard" label="Update dashboard" />
        <PermissionButton action="delete" resource="dashboard" label="Delete dashboard" />
        <button onClick={() => void logout()}>Logout</button>
      </div>

      <h4>Event log</h4>
      <ul className="event-log">
        {events.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
