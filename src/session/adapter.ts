export interface SessionDiscovery {
  enabled?: boolean
  needsSetup?: boolean
  loginMode?: 'password' | 'redirect' | 'custom'
  metadata?: Record<string, unknown>
}

export interface AdapterCallOptions {
  signal?: AbortSignal
  fetch: typeof globalThis.fetch
}

export interface SessionAdapter<User, Credentials = unknown> {
  discover?(options: AdapterCallOptions): Promise<SessionDiscovery>
  getUser(options: AdapterCallOptions): Promise<User | null>
  login(credentials: Credentials, options: AdapterCallOptions): Promise<User | void>
  logout(options: AdapterCallOptions): Promise<void>
  refresh?(options: AdapterCallOptions): Promise<boolean | void>
}

export function defineSessionAdapter<User, Credentials = unknown>(
  adapter: SessionAdapter<User, Credentials>,
): SessionAdapter<User, Credentials> {
  return adapter
}
