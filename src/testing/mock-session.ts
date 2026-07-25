import type { SessionAdapter, SessionDiscovery } from '../session/adapter'

export interface MockSessionInit<User> {
  user?: User | null
  discovery?: SessionDiscovery
}

export interface MockSessionAdapter<User, Credentials = unknown> {
  adapter: SessionAdapter<User, Credentials>
  setUser(user: User | null): void
  setDiscovery(discovery: SessionDiscovery): void
  setRefreshResult(result: 'success' | 'failure'): void
  setRefreshDelay(ms: number): void
}

export function createMockSessionAdapter<User, Credentials = unknown>(
  init: MockSessionInit<User> = {},
): MockSessionAdapter<User, Credentials> {
  let user: User | null = init.user ?? null
  let discovery: SessionDiscovery = init.discovery ?? { enabled: true }
  let refreshResult: 'success' | 'failure' = 'success'
  let refreshDelayMs = 0

  const adapter: SessionAdapter<User, Credentials> = {
    async discover() {
      return discovery
    },
    async getUser() {
      return user
    },
    async login() {
      return user ?? undefined
    },
    async logout() {
      user = null
    },
    async refresh() {
      if (refreshDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, refreshDelayMs))
      }
      return refreshResult === 'success'
    },
  }

  return {
    adapter,
    setUser(next) {
      user = next
    },
    setDiscovery(next) {
      discovery = next
    },
    setRefreshResult(result) {
      refreshResult = result
    },
    setRefreshDelay(ms) {
      refreshDelayMs = ms
    },
  }
}

export interface DeferredRefresh {
  refresh: () => Promise<boolean>
  resolve(result: boolean): void
  reject(error?: unknown): void
}

export function createDeferredRefresh(): DeferredRefresh {
  let resolveFn!: (value: boolean) => void
  let rejectFn!: (reason?: unknown) => void
  const promise = new Promise<boolean>((resolve, reject) => {
    resolveFn = resolve
    rejectFn = reject
  })

  return {
    refresh: () => promise,
    resolve(result) {
      resolveFn(result)
    },
    reject(error) {
      rejectFn(error)
    },
  }
}
