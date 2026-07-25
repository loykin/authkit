import type {
  AuthManager,
  AuthPermissionRequest,
  AuthState,
  AuthStatus,
  ChallengeHandler,
  EnsureOptions,
  InitializeOptions,
  PermissionDecision,
  PermissionScope,
  ResolveOptions,
} from './types'
import {
  AuthError,
  AuthorizationDeniedError,
  ChallengeRequiredError,
  PermissionLoadError,
} from './errors'
import { createAuthStateStore, initialAuthState } from './state'
import { createEventEmitter } from './events'
import type { AdapterCallOptions, SessionAdapter } from './session/adapter'
import type { PermissionSource } from './permissions/source'
import type { Authorizer } from './permissions/authorizer'
import { createKeyAuthorizer } from './permissions/key-authorizer'
import {
  normalizePermissionRequest,
  type PermissionRequestNormalizer,
} from './permissions/normalize'
import { createRefreshCoordinator } from './transport/refresh-coordinator'
import { createAuthFetch } from './transport/auth-fetch'
import type { CsrfStrategy } from './transport/csrf'

export interface CreateAuthManagerOptions<
  User,
  Credentials = unknown,
  Grant = unknown,
  PermissionRequest extends AuthPermissionRequest = AuthPermissionRequest,
> {
  session: SessionAdapter<User, Credentials>
  permissions?: PermissionSource<User, Grant>
  authorizer?: Authorizer<User, Grant>
  challengeHandler?: ChallengeHandler
  normalizePermissionRequest?: PermissionRequestNormalizer<PermissionRequest>
  csrf?: CsrfStrategy
  fetch?: typeof globalThis.fetch
}

export function createAuthManager<
  User,
  Credentials = unknown,
  Grant = unknown,
  PermissionRequest extends AuthPermissionRequest = AuthPermissionRequest,
>(
  options: CreateAuthManagerOptions<User, Credentials, Grant, PermissionRequest>,
): AuthManager<User, Credentials, PermissionRequest> {
  const session = options.session
  const permissionSource = options.permissions
  const authorizer: Authorizer<User, Grant> =
    options.authorizer ?? (createKeyAuthorizer() as unknown as Authorizer<User, Grant>)
  const challengeHandler = options.challengeHandler
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)

  const store = createAuthStateStore<User>(initialAuthState<User>())
  const events = createEventEmitter<User>()

  let grants: readonly Grant[] = []
  let initializePromise: Promise<void> | null = null

  function patch(partial: Partial<AuthState<User>>) {
    store.setState((prev) => ({ ...prev, ...partial }))
  }

  function callOptions(signal?: AbortSignal): AdapterCallOptions {
    return { signal, fetch: fetchImpl }
  }

  function normalize(request: PermissionRequest | string): PermissionRequest {
    return normalizePermissionRequest(request, options.normalizePermissionRequest)
  }

  function setUser(user: User | null, status: AuthStatus) {
    const prevUser = store.getState().user
    patch({ user, status, error: null })
    if (prevUser !== user) {
      events.emit({ type: 'user-changed', user })
    }
    if (user === null) {
      grants = []
      patch({ permissionStatus: 'idle', permissionError: null })
    }
  }

  async function loadPermissions(scope?: PermissionScope, signal?: AbortSignal): Promise<void> {
    const user = store.getState().user
    if (!permissionSource || user === null) {
      patch({ permissionStatus: 'idle', permissionError: null })
      return
    }

    patch({ permissionStatus: 'loading', permissionError: null })
    events.emit({ type: 'permissions-loading', scope })

    try {
      grants = await permissionSource.load({ user, scope, signal })
      patch({
        permissionStatus: 'ready',
        permissionError: null,
        permissionsVersion: store.getState().permissionsVersion + 1,
      })
      events.emit({ type: 'permissions-updated', scope })
    } catch (cause) {
      const error = new PermissionLoadError('Failed to load permissions', { cause })
      patch({ permissionStatus: 'error', permissionError: error })
      events.emit({ type: 'permissions-failed', error: cause })
    }
  }

  async function initialize(initOptions: InitializeOptions = {}): Promise<void> {
    if (initializePromise) return initializePromise
    if (store.getState().status !== 'idle') return

    initializePromise = (async () => {
      patch({ status: 'initializing', error: null })
      try {
        const co = callOptions(initOptions.signal)
        const discovery = session.discover ? await session.discover(co) : { enabled: true }

        if (discovery.enabled === false) {
          patch({ status: 'disabled' })
          events.emit({ type: 'initialized', state: store.getState() })
          return
        }
        if (discovery.needsSetup) {
          patch({ status: 'setup-required' })
          events.emit({ type: 'initialized', state: store.getState() })
          return
        }

        const user = await session.getUser(co)
        if (user) {
          setUser(user, 'authenticated')
          void loadPermissions(undefined, initOptions.signal)
        } else {
          setUser(null, 'anonymous')
        }
        events.emit({ type: 'initialized', state: store.getState() })
      } catch (cause) {
        const error = new AuthError('Failed to initialize auth state', {
          code: 'initialize_failed',
          cause,
        })
        patch({ status: 'error', error })
      }
    })()

    return initializePromise
  }

  async function login(credentials: Credentials): Promise<void> {
    const co = callOptions()
    const result = await session.login(credentials, co)
    const user = result ?? (await session.getUser(co))
    setUser(user, user ? 'authenticated' : 'anonymous')
    if (user) {
      events.emit({ type: 'login', user })
      await loadPermissions()
    }
  }

  async function logout(): Promise<void> {
    const co = callOptions()
    try {
      await session.logout(co)
    } finally {
      setUser(null, 'anonymous')
      events.emit({ type: 'logout' })
    }
  }

  const refresh = createRefreshCoordinator(async () => {
    if (!session.refresh) return false
    const adapterRefresh = session.refresh

    events.emit({ type: 'refresh-started' })
    patch({ refreshing: true })
    try {
      const result = await adapterRefresh(callOptions())
      const ok = result !== false
      if (ok) {
        events.emit({ type: 'refresh-succeeded' })
      } else {
        events.emit({ type: 'refresh-failed' })
        setUser(null, 'anonymous')
        events.emit({ type: 'session-expired' })
      }
      return ok
    } catch (cause) {
      events.emit({ type: 'refresh-failed', error: cause })
      setUser(null, 'anonymous')
      events.emit({ type: 'session-expired' })
      return false
    } finally {
      patch({ refreshing: false })
    }
  })

  async function reloadUser(): Promise<void> {
    const co = callOptions()
    const user = await session.getUser(co)
    setUser(user, user ? 'authenticated' : 'anonymous')
  }

  async function reloadPermissions(scope?: PermissionScope): Promise<void> {
    await loadPermissions(scope)
  }

  function decide(request: PermissionRequest | string): PermissionDecision {
    const state = store.getState()
    if (state.user === null) {
      return { status: 'denied', reason: 'anonymous' }
    }
    if (state.permissionStatus === 'error') {
      return { status: 'unknown', reason: 'permission load failed' }
    }
    if (state.permissionStatus !== 'ready') {
      return { status: 'unknown', reason: 'permissions not loaded' }
    }
    return authorizer.decide({ user: state.user, grants, request: normalize(request) })
  }

  function can(request: PermissionRequest | string): boolean {
    return decide(request).status === 'allowed'
  }

  async function resolve(
    request: PermissionRequest | string,
    resolveOptions: ResolveOptions = {},
  ): Promise<PermissionDecision> {
    let decision = decide(request)
    if (decision.status === 'unknown') {
      await loadPermissions(undefined, resolveOptions.signal)
      decision = decide(request)
    }
    return decision
  }

  async function ensure(
    request: PermissionRequest | string,
    ensureOptions: EnsureOptions = {},
  ): Promise<PermissionDecision> {
    let decision = await resolve(request, { signal: ensureOptions.signal })

    if (decision.status === 'challenge') {
      if (!ensureOptions.interactive || !challengeHandler) {
        return decision
      }

      const challenge = decision.challenge
      const result = await challengeHandler.handle(challenge, {
        request: normalize(request),
        signal: ensureOptions.signal,
      })
      events.emit({ type: 'challenge', challenge })

      if (!result.success) {
        return result.cancelled ? decision : { status: 'denied', reason: 'challenge failed' }
      }

      await reloadUser()
      await loadPermissions()
      decision = decide(request)
    }

    if (decision.status === 'denied') {
      events.emit({
        type: 'authorization-denied',
        request: normalize(request),
        reason: decision.reason,
      })
    }

    return decision
  }

  async function require(
    request: PermissionRequest | string,
    ensureOptions: EnsureOptions = {},
  ): Promise<void> {
    const decision = await ensure(request, ensureOptions)
    if (decision.status === 'allowed') return
    if (decision.status === 'challenge') {
      throw new ChallengeRequiredError(decision.challenge)
    }
    throw new AuthorizationDeniedError('Not authorized', { cause: decision })
  }

  const authFetch = createAuthFetch({
    fetch: fetchImpl,
    refresh,
    csrf: options.csrf,
  })

  return {
    initialize,
    login,
    logout,
    refresh,
    reloadUser,
    reloadPermissions,
    getState: () => store.getState(),
    subscribe: (listener) => store.subscribe(() => listener()),
    subscribeEvent: (listener) => events.subscribe(listener),
    can,
    decide,
    resolve,
    ensure,
    require,
    fetch: authFetch,
  }
}
