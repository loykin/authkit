import { afterEach, describe, expect, it, vi } from 'vitest'
import * as core from '../src/index'
import {
  createAuthScenario,
  createDeferredRefresh,
  createMockAuthManager,
  createMockSessionAdapter,
} from '../src/testing/index'

interface TestUser {
  id: string
  roles: string[]
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('real/mock parity', () => {
  it('root package does not re-export testing APIs', () => {
    expect((core as Record<string, unknown>).createMockAuthManager).toBeUndefined()
  })

  it('mock manager implements the full AuthManager surface', () => {
    const auth = createMockAuthManager<TestUser>()
    for (const method of [
      'initialize',
      'login',
      'logout',
      'refresh',
      'reloadUser',
      'reloadPermissions',
      'getState',
      'subscribe',
      'subscribeEvent',
      'can',
      'decide',
      'resolve',
      'ensure',
      'require',
      'fetch',
    ]) {
      expect(typeof (auth as unknown as Record<string, unknown>)[method]).toBe('function')
    }
  })
})

describe('createMockAuthManager() construction', () => {
  it('starts authenticated with the given user and permissions', async () => {
    const auth = createMockAuthManager<TestUser>({
      user: { id: 'dev-admin', roles: ['admin'] },
      permissions: ['dashboard:read', 'dashboard:create'],
    })

    await auth.initialize()
    await flush()

    expect(auth.getState().status).toBe('authenticated')
    expect(auth.can('dashboard:create')).toBe(true)
    expect(auth.can('dashboard:delete')).toBe(false)
  })

  it('accepts a scenario object built via createAuthScenario()', async () => {
    const viewer = createAuthScenario<TestUser>({
      user: { id: 'viewer', roles: ['viewer'] },
      permissions: ['dashboard:read'],
    })
    const auth = createMockAuthManager<TestUser>({ scenario: viewer })

    await auth.initialize()
    await flush()

    expect(auth.can('dashboard:read')).toBe(true)
    expect(auth.can('dashboard:create')).toBe(false)
  })

  it('starts anonymous with no options', async () => {
    const auth = createMockAuthManager<TestUser>()
    await auth.initialize()

    expect(auth.getState().status).toBe('anonymous')
  })
})

describe('.mock.setScenario()/.setAnonymous()', () => {
  it('switches the active user and permissions, and notifies subscribers', async () => {
    const auth = createMockAuthManager<TestUser>({
      user: { id: 'viewer', roles: ['viewer'] },
      permissions: ['dashboard:read'],
    })
    await auth.initialize()
    await flush()

    const listener = vi.fn()
    auth.subscribe(listener)

    auth.mock.setScenario(
      createAuthScenario<TestUser>({
        user: { id: 'admin', roles: ['admin'] },
        permissions: ['*'],
      }),
    )
    await flush()

    expect(listener).toHaveBeenCalled()
    expect(auth.getState().user).toEqual({ id: 'admin', roles: ['admin'] })
    expect(auth.can('dashboard:delete')).toBe(true)
  })

  it('setAnonymous() clears the user and denies everything', async () => {
    const auth = createMockAuthManager<TestUser>({
      user: { id: 'admin', roles: ['admin'] },
      permissions: ['*'],
    })
    await auth.initialize()
    await flush()
    expect(auth.can('dashboard:read')).toBe(true)

    auth.mock.setAnonymous()
    await flush()

    expect(auth.getState().status).toBe('anonymous')
    expect(auth.can('dashboard:read')).toBe(false)
  })
})

describe('.mock.grant()/.revoke()/.replacePermissions()', () => {
  it('grant() adds a permission that can() then reflects', async () => {
    const auth = createMockAuthManager<TestUser>({ user: { id: 'u1', roles: [] } })
    await auth.initialize()
    await flush()
    expect(auth.can('dashboard:create')).toBe(false)

    auth.mock.grant('dashboard:create')
    await flush()

    expect(auth.can('dashboard:create')).toBe(true)
  })

  it('revoke() removes a previously granted permission', async () => {
    const auth = createMockAuthManager<TestUser>({
      user: { id: 'u1', roles: [] },
      permissions: ['dashboard:create'],
    })
    await auth.initialize()
    await flush()

    auth.mock.revoke('dashboard:create')
    await flush()

    expect(auth.can('dashboard:create')).toBe(false)
  })

  it('replacePermissions() swaps the whole grant set', async () => {
    const auth = createMockAuthManager<TestUser>({
      user: { id: 'u1', roles: [] },
      permissions: ['dashboard:create'],
    })
    await auth.initialize()
    await flush()

    auth.mock.replacePermissions(['dashboard:read', 'dashboard:update'])
    await flush()

    expect(auth.can('dashboard:create')).toBe(false)
    expect(auth.can('dashboard:read')).toBe(true)
    expect(auth.can('dashboard:update')).toBe(true)
  })
})

describe('.mock.setDecision()', () => {
  it('overrides the decision for one specific resourceId', async () => {
    const auth = createMockAuthManager<TestUser>({
      user: { id: 'owner', roles: ['owner'] },
      permissions: ['dashboard:delete'],
    })
    await auth.initialize()
    await flush()

    expect(auth.can({ action: 'delete', resource: 'dashboard', resourceId: 'dashboard-1' })).toBe(
      true,
    )

    auth.mock.setDecision(
      { action: 'delete', resource: 'dashboard', resourceId: 'dashboard-1' },
      { status: 'denied', reason: 'Only owners can delete dashboards' },
    )
    await flush()

    const decision = auth.decide({
      action: 'delete',
      resource: 'dashboard',
      resourceId: 'dashboard-1',
    })
    expect(decision).toEqual({ status: 'denied', reason: 'Only owners can delete dashboards' })
    // other resourceIds / requests are unaffected
    expect(auth.can({ action: 'delete', resource: 'dashboard', resourceId: 'dashboard-2' })).toBe(
      true,
    )
  })
})

describe('.mock.expireSession()', () => {
  it('drops the session back to anonymous', async () => {
    const auth = createMockAuthManager<TestUser>({ user: { id: 'u1', roles: [] } })
    await auth.initialize()
    await flush()
    expect(auth.getState().status).toBe('authenticated')

    auth.mock.expireSession()
    await flush()

    expect(auth.getState().status).toBe('anonymous')
    expect(auth.getState().user).toBeNull()
  })
})

describe('.mock.setRefreshResult()/.setRefreshDelay()', () => {
  it('drives manager.refresh() to succeed or fail as configured', async () => {
    const auth = createMockAuthManager<TestUser>({ user: { id: 'u1', roles: [] } })
    await auth.initialize()

    auth.mock.setRefreshResult('success')
    await expect(auth.refresh()).resolves.toBe(true)

    auth.mock.setRefreshResult('failure')
    await expect(auth.refresh()).resolves.toBe(false)
    expect(auth.getState().status).toBe('anonymous')
  })

  it('delays refresh() by the configured amount', async () => {
    vi.useFakeTimers()
    const auth = createMockAuthManager<TestUser>({ user: { id: 'u1', roles: [] } })
    await auth.initialize()
    auth.mock.setRefreshDelay(500)

    let settled = false
    const pending = auth.refresh().then((result) => {
      settled = true
      return result
    })

    await vi.advanceTimersByTimeAsync(100)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(500)
    expect(await pending).toBe(true)
    expect(settled).toBe(true)

    vi.useRealTimers()
  })
})

describe('.mock.triggerUnauthorized()', () => {
  it('drives the real 401 -> refresh -> retry pipeline through manager.fetch()', async () => {
    const auth = createMockAuthManager<TestUser>({ user: { id: 'u1', roles: [] } })
    await auth.initialize()
    auth.mock.setRefreshResult('success')

    const events: string[] = []
    auth.subscribeEvent((e) => events.push(e.type))

    await auth.mock.triggerUnauthorized()

    expect(events).toContain('refresh-started')
    expect(events).toContain('refresh-succeeded')
  })

  it('logs the session out when refresh fails during the triggered 401', async () => {
    const auth = createMockAuthManager<TestUser>({ user: { id: 'u1', roles: [] } })
    await auth.initialize()
    auth.mock.setRefreshResult('failure')

    await auth.mock.triggerUnauthorized()

    expect(auth.getState().status).toBe('anonymous')
  })
})

describe('createDeferredRefresh()', () => {
  it('lets a test manually resolve a session adapter refresh() call', async () => {
    const deferred = createDeferredRefresh()
    const session = createMockSessionAdapter<TestUser>({ user: { id: 'u1', roles: [] } })
    const auth = core.createAuthManager<TestUser>({
      session: { ...session.adapter, refresh: deferred.refresh },
    })
    await auth.initialize()

    let settled = false
    const pending = auth.refresh().then((r) => {
      settled = true
      return r
    })
    await flush()
    expect(settled).toBe(false)

    deferred.resolve(true)
    expect(await pending).toBe(true)
  })
})

describe('production safeguard', () => {
  const originalEnv = process.env['NODE_ENV']

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv
  })

  it('refuses to create a mock manager when NODE_ENV=production', () => {
    process.env['NODE_ENV'] = 'production'
    expect(() => createMockAuthManager<TestUser>()).toThrow(/production/i)
  })

  it('allows it when allowProduction is explicitly set', () => {
    process.env['NODE_ENV'] = 'production'
    expect(() => createMockAuthManager<TestUser>({ allowProduction: true })).not.toThrow()
  })

  it('does not throw outside production', () => {
    process.env['NODE_ENV'] = 'test'
    expect(() => createMockAuthManager<TestUser>()).not.toThrow()
  })
})
