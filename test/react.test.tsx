// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { createAuthManager, type AuthManager, type SessionAdapter } from '../src/index'
import {
  AuthProvider,
  Anonymous,
  Authenticated,
  CanAuth,
  useAuth,
  useCanAuth,
} from '../src/react/index'

interface TestUser {
  id: string
  roles: string[]
}

interface TestCredentials {
  username: string
  password: string
}

function createSessionAdapter(overrides: Partial<SessionAdapter<TestUser, TestCredentials>> = {}) {
  return {
    getUser: vi.fn(async () => null),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    ...overrides,
  } satisfies SessionAdapter<TestUser, TestCredentials>
}

function AuthStatusProbe() {
  const { status } = useAuth<TestUser, TestCredentials>()
  return <span data-testid="status">{status}</span>
}

describe('AuthProvider', () => {
  it('calls manager.initialize() exactly once, even under StrictMode double-invoke', async () => {
    const getUser = vi.fn(async () => null)
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({ getUser }),
    })

    await act(async () => {
      render(
        <StrictMode>
          <AuthProvider manager={manager}>
            <AuthStatusProbe />
          </AuthProvider>
        </StrictMode>,
      )
    })

    expect(getUser).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status').textContent).toBe('anonymous')
  })
})

describe('useAuth()', () => {
  it('re-renders with the new status after login()', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        login: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
    })

    await act(async () => {
      render(
        <AuthProvider manager={manager}>
          <AuthStatusProbe />
        </AuthProvider>,
      )
    })

    expect(screen.getByTestId('status').textContent).toBe('anonymous')

    await act(async () => {
      await manager.login({ username: 'a', password: 'b' })
    })

    expect(screen.getByTestId('status').textContent).toBe('authenticated')
  })
})

function DeleteWidget() {
  const canDelete = useCanAuth({ action: 'delete', resource: 'dashboard' })
  return <span data-testid="can-delete">{String(canDelete)}</span>
}

describe('useCanAuth()', () => {
  it('flips to true once permissions load and grant it', async () => {
    let resolveLoad!: (grants: string[]) => void
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
      permissions: {
        load: vi.fn(() => new Promise<string[]>((resolve) => (resolveLoad = resolve))),
      },
    })

    await act(async () => {
      render(
        <AuthProvider manager={manager}>
          <DeleteWidget />
        </AuthProvider>,
      )
    })

    expect(screen.getByTestId('can-delete').textContent).toBe('false')

    await act(async () => {
      resolveLoad(['dashboard:delete'])
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(screen.getByTestId('can-delete').textContent).toBe('true')
  })

  it('does not re-render when an unrelated state field changes (e.g. refreshing)', async () => {
    let renderCount = 0
    function CountingDeleteWidget() {
      renderCount += 1
      const canDelete = useCanAuth({ action: 'delete', resource: 'dashboard' })
      return <span data-testid="can-delete">{String(canDelete)}</span>
    }

    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
        refresh: vi.fn(async () => true),
      }),
      permissions: { load: vi.fn(async () => ['dashboard:delete']) },
    })

    await act(async () => {
      render(
        <AuthProvider manager={manager}>
          <CountingDeleteWidget />
        </AuthProvider>,
      )
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(screen.getByTestId('can-delete').textContent).toBe('true')
    const renderCountAfterLoad = renderCount

    // triggers refreshing: true -> false, which changes AuthState but not
    // user/permissionStatus/permissionsVersion — should not re-render this widget
    await act(async () => {
      await manager.refresh()
    })

    expect(renderCount).toBe(renderCountAfterLoad)
  })
})

describe('<CanAuth>', () => {
  it('renders children when allowed and nothing by default when not', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
      permissions: { load: vi.fn(async () => ['dashboard:create']) },
    })

    await act(async () => {
      render(
        <AuthProvider manager={manager}>
          <CanAuth action="create" resource="dashboard">
            <button>Create</button>
          </CanAuth>
          <CanAuth action="delete" resource="dashboard" fallback={<span>no access</span>}>
            <button>Delete</button>
          </CanAuth>
        </AuthProvider>,
      )
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.getByText('no access')).toBeTruthy()
  })
})

describe('<Authenticated>/<Anonymous>', () => {
  function PublicPage({ manager }: { manager: AuthManager<TestUser, TestCredentials> }) {
    return (
      <AuthProvider manager={manager}>
        <span>public content</span>
        <Authenticated>
          <span>user menu</span>
        </Authenticated>
        <Anonymous>
          <span>login button</span>
        </Anonymous>
      </AuthProvider>
    )
  }

  it('shows the login button while anonymous and the user menu once authenticated', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        login: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
    })

    await act(async () => {
      render(<PublicPage manager={manager} />)
    })

    expect(screen.getByText('public content')).toBeTruthy()
    expect(screen.getByText('login button')).toBeTruthy()
    expect(screen.queryByText('user menu')).toBeNull()

    await act(async () => {
      await manager.login({ username: 'a', password: 'b' })
    })

    expect(screen.getByText('user menu')).toBeTruthy()
    expect(screen.queryByText('login button')).toBeNull()
  })
})
