import { createAuthManager } from '../manager'
import { createKeyAuthorizer } from '../permissions/key-authorizer'
import type { Authorizer } from '../permissions/authorizer'
import type { AuthManager, AuthPermissionRequest, PermissionDecision } from '../types'
import { createMockPermissionSource } from './mock-permissions'
import { createMockSessionAdapter } from './mock-session'
import type { AuthScenario } from './scenarios'

export interface MockAuthManagerOptions<User> {
  user?: User | null
  permissions?: readonly string[]
  scenario?: AuthScenario<User>
  allowProduction?: boolean
}

export interface MockAuthControls<User> {
  setScenario(scenario: AuthScenario<User>): void
  setAnonymous(): void
  grant(permission: string): void
  revoke(permission: string): void
  replacePermissions(permissions: readonly string[]): void
  setDecision(request: AuthPermissionRequest, decision: PermissionDecision): void
  expireSession(): void
  setRefreshResult(result: 'success' | 'failure'): void
  setRefreshDelay(ms: number): void
  triggerUnauthorized(): Promise<void>
}

export type MockAuthManager<
  User,
  Credentials = unknown,
  PermissionRequest extends AuthPermissionRequest = AuthPermissionRequest,
> = AuthManager<User, Credentials, PermissionRequest> & {
  mock: MockAuthControls<User>
}

function isProductionEnvironment(): boolean {
  try {
    return typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'production'
  } catch {
    return false
  }
}

function requestKey(request: AuthPermissionRequest): string {
  return `${request.action}:${request.resource}:${request.resourceId ?? ''}`
}

const MOCK_FETCH_ORIGIN = 'https://mock.authkit.local'

export function createMockAuthManager<
  User,
  Credentials = unknown,
  PermissionRequest extends AuthPermissionRequest = AuthPermissionRequest,
>(
  options: MockAuthManagerOptions<User> = {},
): MockAuthManager<User, Credentials, PermissionRequest> {
  if (isProductionEnvironment() && !options.allowProduction) {
    throw new Error(
      'createMockAuthManager() was called in what looks like a production environment ' +
        '(NODE_ENV=production). Pass { allowProduction: true } if this is intentional.',
    )
  }

  const initialUser = options.scenario?.user ?? options.user ?? null
  const initialGrants = options.scenario?.permissions ?? options.permissions ?? []
  const initialStatus = options.scenario?.status

  const session = createMockSessionAdapter<User, Credentials>({
    user: initialUser,
    discovery:
      initialStatus === 'disabled'
        ? { enabled: false }
        : initialStatus === 'setup-required'
          ? { enabled: true, needsSetup: true }
          : { enabled: true },
  })
  const permissions = createMockPermissionSource<User>(initialGrants)

  const overrides = new Map<string, PermissionDecision>()
  const baseAuthorizer = createKeyAuthorizer<User>()
  const authorizer: Authorizer<User, string> = {
    decide(input) {
      const override = overrides.get(requestKey(input.request))
      return override ?? baseAuthorizer.decide(input)
    },
  }

  let unauthorizedOnce = false
  const mockFetch: typeof fetch = async () => {
    if (unauthorizedOnce) {
      unauthorizedOnce = false
      return new Response(null, { status: 401 })
    }
    return new Response(null, { status: 200 })
  }

  const manager = createAuthManager<User, Credentials, string, PermissionRequest>({
    session: session.adapter,
    permissions: permissions.source,
    authorizer,
    fetch: mockFetch,
  })

  const mock: MockAuthControls<User> = {
    setScenario(scenario) {
      session.setUser(scenario.user ?? null)
      permissions.setGrants(scenario.permissions ?? [])
      void manager.reloadUser().then(() => manager.reloadPermissions())
    },
    setAnonymous() {
      mock.setScenario({ status: 'anonymous', user: null, permissions: [] })
    },
    grant(permission) {
      permissions.grant(permission)
      void manager.reloadPermissions()
    },
    revoke(permission) {
      permissions.revoke(permission)
      void manager.reloadPermissions()
    },
    replacePermissions(next) {
      permissions.setGrants(next)
      void manager.reloadPermissions()
    },
    setDecision(request, decision) {
      overrides.set(requestKey(request), decision)
      void manager.reloadPermissions()
    },
    expireSession() {
      session.setUser(null)
      void manager.reloadUser()
    },
    setRefreshResult(result) {
      session.setRefreshResult(result)
    },
    setRefreshDelay(ms) {
      session.setRefreshDelay(ms)
    },
    async triggerUnauthorized() {
      unauthorizedOnce = true
      await manager.fetch(`${MOCK_FETCH_ORIGIN}/__trigger_unauthorized__`)
    },
  }

  return Object.assign(manager, { mock })
}
