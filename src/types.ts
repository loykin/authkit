import type { AuthError } from './errors'

export type AuthStatus =
  'idle' | 'initializing' | 'anonymous' | 'authenticated' | 'disabled' | 'setup-required' | 'error'

export type PermissionStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface AuthState<User> {
  status: AuthStatus
  user: User | null
  refreshing: boolean
  error: AuthError | null

  permissionStatus: PermissionStatus
  permissionError: AuthError | null
  permissionsVersion: number

  tenantId?: string
  metadata?: Record<string, unknown>
}

export interface PermissionScope {
  tenantId?: string
  projectId?: string
  resource?: string
  key?: string
}

export interface AuthPermissionRequest<Context = unknown> {
  action: string
  resource: string
  resourceId?: string
  context?: Context
  scope?: PermissionScope
}

export type PermissionDecision =
  | { status: 'allowed'; source?: string }
  | { status: 'denied'; reason?: string; source?: string }
  | { status: 'unknown'; reason?: string }
  | { status: 'challenge'; challenge: AuthChallenge; reason?: string }

export interface AuthChallenge {
  type: 'reauth' | 'mfa' | 'consent' | 'redirect' | string
  payload?: unknown
}

export interface ChallengeResult {
  success: boolean
  cancelled?: boolean
  data?: unknown
}

export interface ChallengeHandler {
  handle(
    challenge: AuthChallenge,
    context: {
      request: AuthPermissionRequest
      signal?: AbortSignal
    },
  ): Promise<ChallengeResult>
}

export type AuthEvent<User> =
  | { type: 'initialized'; state: AuthState<User> }
  | { type: 'login'; user: User }
  | { type: 'logout' }
  | { type: 'user-changed'; user: User | null }
  | { type: 'tenant-changed'; tenantId?: string }
  | { type: 'refresh-started' }
  | { type: 'refresh-succeeded' }
  | { type: 'refresh-failed'; error?: unknown }
  | { type: 'session-expired' }
  | { type: 'permissions-loading'; scope?: PermissionScope }
  | { type: 'permissions-updated'; scope?: PermissionScope }
  | { type: 'permissions-failed'; error: unknown }
  | { type: 'authorization-denied'; request: AuthPermissionRequest; reason?: string }
  | { type: 'challenge'; challenge: AuthChallenge }

export interface InitializeOptions {
  signal?: AbortSignal
}

export interface ResolveOptions {
  signal?: AbortSignal
}

export interface EnsureOptions {
  interactive?: boolean
  signal?: AbortSignal
}

export interface AuthManager<
  User,
  Credentials = unknown,
  PermissionRequest extends AuthPermissionRequest = AuthPermissionRequest,
> {
  initialize(options?: InitializeOptions): Promise<void>
  login(credentials: Credentials): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<boolean>
  reloadUser(): Promise<void>
  reloadPermissions(scope?: PermissionScope): Promise<void>

  getState(): AuthState<User>
  subscribe(listener: () => void): () => void
  subscribeEvent(listener: (event: AuthEvent<User>) => void): () => void

  can(request: PermissionRequest | string): boolean
  decide(request: PermissionRequest | string): PermissionDecision
  resolve(
    request: PermissionRequest | string,
    options?: ResolveOptions,
  ): Promise<PermissionDecision>
  ensure(request: PermissionRequest | string, options?: EnsureOptions): Promise<PermissionDecision>
  require(request: PermissionRequest | string, options?: EnsureOptions): Promise<void>

  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}
