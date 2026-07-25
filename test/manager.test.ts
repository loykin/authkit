import { describe, expect, it, vi } from 'vitest'
import {
  createAuthManager,
  createKeyAuthorizer,
  type AuthChallenge,
  type AuthEvent,
  type ChallengeHandler,
  type PermissionSource,
  type SessionAdapter,
} from '../src/index'

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

function createPermissionSource(grants: string[]): PermissionSource<TestUser, string> {
  return {
    load: vi.fn(async () => grants),
  }
}

function collectEvents(manager: {
  subscribeEvent(l: (e: AuthEvent<TestUser>) => void): () => void
}) {
  const events: AuthEvent<TestUser>[] = []
  manager.subscribeEvent((event) => events.push(event))
  return events
}

describe('initialize()', () => {
  it('resolves to anonymous when there is no user', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter(),
    })

    await manager.initialize()

    expect(manager.getState().status).toBe('anonymous')
    expect(manager.getState().user).toBeNull()
  })

  it('resolves to authenticated and loads permissions when a user is present', async () => {
    const source = createPermissionSource(['dashboard:read'])
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
      permissions: source,
    })

    await manager.initialize()
    // permission load is fired-and-forgotten from initialize(); wait a tick
    await new Promise((r) => setTimeout(r, 0))

    expect(manager.getState().status).toBe('authenticated')
    expect(manager.getState().user).toEqual({ id: 'u1', roles: [] })
    expect(manager.getState().permissionStatus).toBe('ready')
    expect(manager.can('dashboard:read')).toBe(true)
  })

  it('resolves to disabled when discover() reports enabled: false', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        discover: vi.fn(async () => ({ enabled: false })),
      }),
    })

    await manager.initialize()

    expect(manager.getState().status).toBe('disabled')
  })

  it('resolves to setup-required when discover() reports needsSetup: true', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        discover: vi.fn(async () => ({ enabled: true, needsSetup: true })),
      }),
    })

    await manager.initialize()

    expect(manager.getState().status).toBe('setup-required')
  })

  it('treats a missing discover() as enabled and no setup required', async () => {
    const session = createSessionAdapter()
    expect(session.discover).toBeUndefined()

    const manager = createAuthManager<TestUser, TestCredentials>({ session })
    await manager.initialize()

    expect(manager.getState().status).toBe('anonymous')
  })

  it('only calls getUser once even if initialize() is called concurrently (Strict Mode double-invoke)', async () => {
    const getUser = vi.fn(async () => null)
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({ getUser }),
    })

    await Promise.all([manager.initialize(), manager.initialize()])

    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('does not re-run initialize() after it has already completed', async () => {
    const getUser = vi.fn(async () => null)
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({ getUser }),
    })

    await manager.initialize()
    await manager.initialize()

    expect(getUser).toHaveBeenCalledTimes(1)
  })
})

describe('login()/logout()', () => {
  it('login() sets authenticated state, loads permissions, and emits login', async () => {
    const source = createPermissionSource(['dashboard:create'])
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        login: vi.fn(async () => ({ id: 'u1', roles: ['admin'] })),
      }),
      permissions: source,
    })
    const events = collectEvents(manager)

    await manager.login({ username: 'a', password: 'b' })

    expect(manager.getState().status).toBe('authenticated')
    expect(manager.getState().permissionStatus).toBe('ready')
    expect(manager.can('dashboard:create')).toBe(true)
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'user-changed',
        'login',
        'permissions-loading',
        'permissions-updated',
      ]),
    )
  })

  it('falls back to getUser() when login() returns void', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        login: vi.fn(async () => undefined),
        getUser: vi.fn(async () => ({ id: 'u2', roles: [] })),
      }),
    })

    await manager.login({ username: 'a', password: 'b' })

    expect(manager.getState().user).toEqual({ id: 'u2', roles: [] })
  })

  it('logout() clears user, permissions, and emits logout', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        login: vi.fn(async () => ({ id: 'u1', roles: [] })),
        logout: vi.fn(async () => undefined),
      }),
      permissions: createPermissionSource(['dashboard:read']),
    })
    await manager.login({ username: 'a', password: 'b' })
    const events = collectEvents(manager)

    await manager.logout()

    expect(manager.getState().status).toBe('anonymous')
    expect(manager.getState().user).toBeNull()
    expect(manager.getState().permissionStatus).toBe('idle')
    expect(manager.can('dashboard:read')).toBe(false)
    expect(events.map((e) => e.type)).toContain('logout')
  })
})

describe('refresh()', () => {
  it('returns false when the adapter does not support refresh', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter(),
    })

    await expect(manager.refresh()).resolves.toBe(false)
  })

  it('dedupes concurrent refresh() calls into a single adapter call (single-flight)', async () => {
    let resolveRefresh!: (value: boolean) => void
    const refresh = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({ refresh }),
    })

    const first = manager.refresh()
    const second = manager.refresh()
    resolveRefresh(true)
    const [a, b] = await Promise.all([first, second])

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(a).toBe(true)
    expect(b).toBe(true)
  })

  it('clears the session and emits session-expired when refresh fails', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        login: vi.fn(async () => ({ id: 'u1', roles: [] })),
        refresh: vi.fn(async () => false),
      }),
    })
    await manager.login({ username: 'a', password: 'b' })
    const events = collectEvents(manager)

    const ok = await manager.refresh()

    expect(ok).toBe(false)
    expect(manager.getState().user).toBeNull()
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['refresh-failed', 'session-expired']),
    )
  })

  it('allows refresh() to be called again after a previous call finished', async () => {
    const refresh = vi.fn(async () => true)
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({ refresh }),
    })

    await manager.refresh()
    await manager.refresh()

    expect(refresh).toHaveBeenCalledTimes(2)
  })
})

describe('permission decisions', () => {
  it('denies by default when permissions have not been loaded yet', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
      // no permission source configured
    })
    await manager.initialize()

    expect(manager.decide('dashboard:read')).toEqual({
      status: 'unknown',
      reason: 'permissions not loaded',
    })
    expect(manager.can('dashboard:read')).toBe(false)
  })

  it('denies anonymous users without invoking the authorizer', async () => {
    const decide = vi.fn(() => ({ status: 'allowed' as const }))
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter(),
      authorizer: { decide },
    })
    await manager.initialize()

    expect(manager.decide('dashboard:read')).toEqual({ status: 'denied', reason: 'anonymous' })
    expect(decide).not.toHaveBeenCalled()
  })

  it('supports wildcard grants via the default key authorizer', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'admin', roles: ['admin'] })),
      }),
      permissions: createPermissionSource(['*']),
    })
    await manager.initialize()
    await new Promise((r) => setTimeout(r, 0))

    expect(manager.can('dashboard:delete')).toBe(true)
    expect(manager.can({ action: 'delete', resource: 'dashboard' })).toBe(true)
  })

  it('resolve() reloads permissions once and then returns a settled decision', async () => {
    const load = vi.fn(async () => ['dashboard:read'])
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
      permissions: { load },
    })
    // initialize() kicks off a background load already; wait for it to settle first
    await manager.initialize()
    await new Promise((r) => setTimeout(r, 0))
    load.mockClear()

    const decision = await manager.resolve('dashboard:read')

    expect(decision).toEqual({ status: 'allowed', source: 'key-authorizer' })
    expect(load).not.toHaveBeenCalled()
  })
})

describe('ensure()/require()', () => {
  it('ensure() returns the challenge decision as-is when not interactive', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
      permissions: createPermissionSource([]),
      authorizer: createKeyAuthorizer<TestUser>(),
      challengeHandler: undefined,
    })
    await manager.initialize()
    await new Promise((r) => setTimeout(r, 0))

    const decision = await manager.ensure('dashboard:delete')
    expect(decision.status).toBe('denied')
  })

  it('ensure() re-checks permissions after a successful interactive challenge', async () => {
    const challenge: AuthChallenge = { type: 'mfa' }
    const authorizer = {
      decide: vi
        .fn()
        .mockReturnValueOnce({ status: 'challenge', challenge })
        .mockReturnValue({ status: 'allowed' }),
    }
    const handler: ChallengeHandler = {
      handle: vi.fn(async () => ({ success: true })),
    }
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
      permissions: createPermissionSource([]),
      authorizer,
      challengeHandler: handler,
    })
    await manager.initialize()
    await new Promise((r) => setTimeout(r, 0))

    const decision = await manager.ensure(
      { action: 'delete', resource: 'datasource' },
      { interactive: true },
    )

    expect(handler.handle).toHaveBeenCalledTimes(1)
    expect(decision).toEqual({ status: 'allowed' })
  })

  it('require() resolves without throwing when allowed', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
      permissions: createPermissionSource(['dashboard:read']),
    })
    await manager.initialize()
    await new Promise((r) => setTimeout(r, 0))

    await expect(manager.require('dashboard:read')).resolves.toBeUndefined()
  })

  it('require() throws AuthorizationDeniedError when denied', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
      permissions: createPermissionSource([]),
    })
    await manager.initialize()
    await new Promise((r) => setTimeout(r, 0))

    await expect(manager.require('dashboard:delete')).rejects.toMatchObject({
      name: 'AuthorizationDeniedError',
    })
  })

  it('require() throws ChallengeRequiredError when a challenge cannot be resolved', async () => {
    const challenge: AuthChallenge = { type: 'reauth' }
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        getUser: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
      permissions: createPermissionSource([]),
      authorizer: { decide: () => ({ status: 'challenge', challenge }) },
    })
    await manager.initialize()
    await new Promise((r) => setTimeout(r, 0))

    await expect(manager.require('dashboard:delete')).rejects.toMatchObject({
      name: 'ChallengeRequiredError',
      challenge,
    })
  })
})

describe('fetch()', () => {
  it('includes credentials by default', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL) => new Response(null, { status: 200 }),
    )
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter(),
      fetch: fetchImpl,
    })

    await manager.fetch('https://example.com/api/dashboards')

    const sentRequest = fetchImpl.mock.calls[0][0] as Request
    expect(sentRequest.url).toBe('https://example.com/api/dashboards')
    expect(sentRequest.credentials).toBe('include')
  })

  it("routes the session adapter's own requests through the raw fetch, bypassing 401 retry", async () => {
    const rawFetch = vi.fn(async () => new Response(null, { status: 401 }))
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        login: vi.fn(async (_credentials, adapterOptions) => {
          await adapterOptions.fetch('https://example.com/api/auth/login')
          return { id: 'u1', roles: [] }
        }),
      }),
      fetch: rawFetch,
    })

    await manager.login({ username: 'a', password: 'b' })

    // the adapter call receives the plain fetch — a single call, no Request wrapping, no retry dance
    expect(rawFetch).toHaveBeenCalledTimes(1)
    expect(rawFetch).toHaveBeenCalledWith('https://example.com/api/auth/login')
  })

  it('shares a single session.refresh() call across two concurrent 401s from manager.fetch()', async () => {
    let resolveAdapterRefresh!: (value: boolean) => void
    const adapterRefresh = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveAdapterRefresh = resolve
        }),
    )
    const rawFetch = vi.fn(async () => new Response(null, { status: 401 }))
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        login: vi.fn(async () => ({ id: 'u1', roles: [] })),
        refresh: adapterRefresh,
      }),
      fetch: rawFetch,
    })
    await manager.login({ username: 'a', password: 'b' })

    const first = manager.fetch('https://example.com/api/a')
    const second = manager.fetch('https://example.com/api/b')
    await new Promise((r) => setTimeout(r, 0))
    resolveAdapterRefresh(false)
    await Promise.all([first, second])

    expect(adapterRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('subscribe()', () => {
  it('notifies subscribers on state changes', async () => {
    const manager = createAuthManager<TestUser, TestCredentials>({
      session: createSessionAdapter({
        login: vi.fn(async () => ({ id: 'u1', roles: [] })),
      }),
    })
    const listener = vi.fn()
    manager.subscribe(listener)

    await manager.login({ username: 'a', password: 'b' })

    expect(listener).toHaveBeenCalled()
  })
})
